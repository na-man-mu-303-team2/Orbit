import type { NestExpressApplication } from "@nestjs/platform-express";

export function configureHttpTrustProxy(
  app: Pick<NestExpressApplication, "set">,
  trustedProxyHops: number,
): void {
  app.set("trust proxy", trustedProxyHops === 0 ? false : trustedProxyHops);
}
