param(
  [string]$Region = "ap-northeast-2",
  [string]$BaseStackName = "orbit-main-production",
  [string]$EcsStackName = "orbit-main-production-ecs",
  [string]$ChangeSetName = ("foundation-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
)

$ErrorActionPreference = "Stop"
$template = Join-Path $PSScriptRoot "..\aws\main-production-ecs.yaml"

aws cloudformation validate-template --region $Region --template-body "file://$template" --query "{Description:Description,Capabilities:Capabilities}"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

function Get-StackResourceId([string]$logicalId) {
  return aws cloudformation describe-stack-resource --region $Region --stack-name $BaseStackName --logical-resource-id $logicalId --query "StackResourceDetail.PhysicalResourceId" --output text
}

$outputs = aws cloudformation describe-stacks --region $Region --stack-name $BaseStackName --query "Stacks[0].Outputs" --output json | ConvertFrom-Json
function Get-StackOutput([string]$key) {
  return ($outputs | Where-Object OutputKey -eq $key).OutputValue
}

$vpc = Get-StackResourceId "Vpc"
$publicSubnetA = Get-StackResourceId "PublicSubnet"
$internetGateway = Get-StackResourceId "InternetGateway"
$rdsSecurityGroup = Get-StackResourceId "RdsSecurityGroup"
$ec2Instance = Get-StackResourceId "AppServerInstance"
$ec2SecurityGroup = Get-StackResourceId "Ec2SecurityGroup"
$assetsBucket = Get-StackOutput "AssetsBucketName"
$staticBucket = Get-StackOutput "StaticWebBucketName"
$distribution = Get-StackOutput "CloudFrontDistributionId"
$rdsEndpoint = Get-StackOutput "RdsEndpointAddress"
$prefixList = aws ec2 describe-managed-prefix-lists --region $Region --query "PrefixLists[?PrefixListName=='com.amazonaws.global.cloudfront.origin-facing'].PrefixListId | [0]" --output text
$hostedZone = aws route53 list-hosted-zones-by-name --dns-name tryorbit.site --query "HostedZones[?Name=='tryorbit.site.'] | [0].Id" --output text
$hostedZone = $hostedZone -replace "^/hostedzone/", ""
$viewerCertificate = aws acm list-certificates --region us-east-1 --certificate-statuses ISSUED --query "CertificateSummaryList[?DomainName=='tryorbit.site'] | [0].CertificateArn" --output text

$requiredValues = @($vpc, $publicSubnetA, $internetGateway, $rdsSecurityGroup, $ec2Instance, $ec2SecurityGroup, $assetsBucket, $staticBucket, $distribution, $rdsEndpoint, $prefixList, $hostedZone, $viewerCertificate)
if ($requiredValues | Where-Object { [string]::IsNullOrWhiteSpace($_) -or $_ -eq "None" }) {
  throw "A required production identifier is missing."
}

$parameters = @(
  "ParameterKey=VpcId,ParameterValue=$vpc",
  "ParameterKey=PublicSubnetAId,ParameterValue=$publicSubnetA",
  "ParameterKey=InternetGatewayId,ParameterValue=$internetGateway",
  "ParameterKey=ExistingRdsSecurityGroupId,ParameterValue=$rdsSecurityGroup",
  "ParameterKey=ExistingEc2InstanceId,ParameterValue=$ec2Instance",
  "ParameterKey=ExistingEc2SecurityGroupId,ParameterValue=$ec2SecurityGroup",
  "ParameterKey=ExistingAssetsBucketName,ParameterValue=$assetsBucket",
  "ParameterKey=ExistingStaticWebBucketName,ParameterValue=$staticBucket",
  "ParameterKey=ExistingCloudFrontDistributionId,ParameterValue=$distribution",
  "ParameterKey=CloudFrontOriginPrefixListId,ParameterValue=$prefixList",
  "ParameterKey=HostedZoneId,ParameterValue=$hostedZone",
  "ParameterKey=CloudFrontViewerCertificateArn,ParameterValue=$viewerCertificate",
  "ParameterKey=RdsEndpointAddress,ParameterValue=$rdsEndpoint"
)

aws cloudformation create-change-set --region $Region --stack-name $EcsStackName --change-set-name $ChangeSetName --change-set-type CREATE --template-body "file://$template" --parameters $parameters --capabilities CAPABILITY_NAMED_IAM --description "Additive ECS foundation; no existing EC2/RDS/S3/CloudFront ownership changes"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

aws cloudformation wait change-set-create-complete --region $Region --stack-name $EcsStackName --change-set-name $ChangeSetName
if ($LASTEXITCODE -ne 0) {
  aws cloudformation describe-change-set --region $Region --stack-name $EcsStackName --change-set-name $ChangeSetName --query "{Status:Status,StatusReason:StatusReason}"
  exit $LASTEXITCODE
}

aws cloudformation describe-change-set --region $Region --stack-name $EcsStackName --change-set-name $ChangeSetName --query "{Status:Status,ExecutionStatus:ExecutionStatus,ChangeCount:length(Changes),Destructive:Changes[?ResourceChange.Action==``Remove`` || ResourceChange.Replacement==``True``].ResourceChange.{Action:Action,LogicalResourceId:LogicalResourceId,Replacement:Replacement}}"
Write-Output "Change set $ChangeSetName is ready and was not executed."
