import { Check, Trash2, X } from "lucide-react";
import type { ProjectMember } from "@orbit/shared";
import type { ShareRole } from "../api/projectMembersApi";

export type ShareAccessTab = "status" | "requests";
export type LocalShareMember = ProjectMember;
export type LocalShareRequest = ProjectMember & {
  role: Exclude<ShareRole, "owner">;
};

export function ShareAccessModal(props: {
  activeTab: ShareAccessTab;
  actionError: string;
  actionLabel: string;
  inviteEmail: string;
  inviteRole: Exclude<ShareRole, "owner">;
  isLoading: boolean;
  members: LocalShareMember[];
  requests: LocalShareRequest[];
  onClose: () => void;
  onInvite: () => void;
  onInviteEmailChange: (email: string) => void;
  onInviteRoleChange: (role: Exclude<ShareRole, "owner">) => void;
  onMemberRemove: (email: string) => void;
  onMemberRoleChange: (email: string, role: ShareRole) => void;
  onRequestStatusChange: (email: string, status: "accepted" | "rejected") => void;
  onTabChange: (tab: ShareAccessTab) => void;
}) {
  return (
    <div className="share-modal-backdrop" role="presentation" onMouseDown={props.onClose}>
      <section
        aria-label="프로젝트 공유"
        aria-modal="true"
        className="share-access-modal"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="share-access-header">
          <div>
            <strong>공유</strong>
            <span>프로젝트 접근 권한과 대기 중인 요청을 관리합니다.</span>
          </div>
          <button type="button" aria-label="공유 닫기" onClick={props.onClose}>
            <X size={16} />
          </button>
        </header>

        <div className="share-access-tabs" role="tablist" aria-label="공유 탭">
          <button
            className={props.activeTab === "status" ? "active" : ""}
            type="button"
            onClick={() => props.onTabChange("status")}
          >
            현황
          </button>
          <button
            className={props.activeTab === "requests" ? "active" : ""}
            type="button"
            onClick={() => props.onTabChange("requests")}
          >
            요청
          </button>
        </div>

        {props.activeTab === "status" ? (
          <div className="share-access-panel">
            <label className="share-invite-field">
              <span>이메일</span>
              <div>
                <input
                  type="email"
                  placeholder="user@example.com"
                  value={props.inviteEmail}
                  onChange={(event) => props.onInviteEmailChange(event.target.value)}
                />
                <select
                  value={props.inviteRole}
                  onChange={(event) =>
                    props.onInviteRoleChange(event.target.value as Exclude<ShareRole, "owner">)
                  }
                >
                  <option value="viewer">viewer</option>
                  <option value="editor">editor</option>
                </select>
                <button type="button" onClick={props.onInvite}>
                  추가
                </button>
              </div>
            </label>

            <div className="share-access-list" aria-label="권한이 있는 사용자">
              <div className="share-access-row member header">
                <span>이메일</span>
                <span>권한</span>
                <span>처리</span>
              </div>
              {props.members.length > 0 ? (
                props.members.map((member) => (
                  <div className="share-access-row member" key={member.userId}>
                    <span>{member.email}</span>
                    <select
                      aria-label={`${member.email} 권한 수정`}
                      value={member.role}
                      onChange={(event) =>
                        props.onMemberRoleChange(member.email, event.target.value as ShareRole)
                      }
                    >
                      <option value="viewer">viewer</option>
                      <option value="editor">editor</option>
                      <option value="owner">owner</option>
                    </select>
                    <span className="share-request-actions">
                      <button
                        type="button"
                        aria-label={`${member.email} 권한 회수`}
                        onClick={() => props.onMemberRemove(member.email)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </span>
                  </div>
                ))
              ) : (
                <div className="share-empty-row">권한이 있는 사용자가 없습니다.</div>
              )}
            </div>
          </div>
        ) : (
          <div className="share-access-panel">
            <div className="share-access-list" aria-label="권한 요청 목록">
              <div className="share-access-row request header">
                <span>요청자</span>
                <span>요청 권한</span>
                <span>처리</span>
              </div>
              {props.requests.length > 0 ? (
                props.requests.map((request) => (
                  <div className="share-access-row request" key={request.userId}>
                    <span>{request.email}</span>
                    <strong>{request.role}</strong>
                    <span className="share-request-actions">
                      <button
                        type="button"
                        aria-label={`${request.email} 요청 승인`}
                        onClick={() => props.onRequestStatusChange(request.email, "accepted")}
                      >
                        <Check size={15} />
                      </button>
                      <button
                        type="button"
                        aria-label={`${request.email} 요청 삭제`}
                        onClick={() => props.onRequestStatusChange(request.email, "rejected")}
                      >
                        <Trash2 size={15} />
                      </button>
                    </span>
                  </div>
                ))
              ) : (
                <div className="share-empty-row">대기 중인 요청이 없습니다.</div>
              )}
            </div>
          </div>
        )}

        {props.isLoading ? <p className="share-action-message">공유 정보를 불러오는 중입니다.</p> : null}
        {props.actionLabel ? <p className="share-action-message">{props.actionLabel}</p> : null}
        {props.actionError ? <p className="share-action-message error">{props.actionError}</p> : null}
      </section>
    </div>
  );
}
