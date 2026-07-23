import { loadOrbitConfig } from "@orbit/config";
import { randomBytes } from "node:crypto";
import { Injectable, NotFoundException } from "@nestjs/common";

import {
  companionAccessScopes,
  createCompanionAccessToken,
  verifyCompanionAccessToken,
  type CompanionAccessTokenPayload,
} from "./companion-access-cookie";
import { PresentationCompanionProjectionService } from "./presentation-companion-projection.service";
import { PresentationSessionRepository } from "./presentation-session.repository";
import {
  PresentationCompanionStore,
  type PresentationCompanionPresence,
} from "./presentation-companion.store";

const pairingTtlSeconds = 2 * 60;
const credentialTtlMs = 4 * 60 * 60 * 1_000;

@Injectable()
export class PresentationCompanionService {
  private readonly config = loadOrbitConfig(process.env, { service: "api" });

  constructor(
    private readonly store: PresentationCompanionStore,
    private readonly sessions: PresentationSessionRepository,
    private readonly projection: PresentationCompanionProjectionService,
  ) {}

  async createPairing(
    projectId: string,
    sessionId: string,
    now = new Date(),
  ): Promise<{ code: string; expiresAt: string }> {
    const session = await this.requireActiveSession(
      sessionId,
      projectId,
      now,
    );
    await this.projection.getDeckProjection(sessionId, now);
    const code = randomBytes(32).toString("base64url");
    await this.store.putPairing(
      code,
      {
        sessionId,
        projectId: session.project_id,
        deckId: session.deck_id!,
        deckVersion: session.deck_version!,
        sessionExpiresAt: toIso(session.expires_at),
      },
      pairingTtlSeconds,
    );
    return {
      code,
      expiresAt: new Date(
        now.getTime() + pairingTtlSeconds * 1_000,
      ).toISOString(),
    };
  }

  async exchangePairing(
    code: string,
    userAgent: string,
    now = new Date(),
  ): Promise<{
    token: string;
    credential: CompanionAccessTokenPayload;
  }> {
    const pairing = await this.store.consumePairing(code);
    if (!pairing) {
      throw companionUnavailable();
    }
    const session = await this.requireActiveSession(
      pairing.sessionId,
      pairing.projectId,
      now,
    );
    if (
      session.deck_id !== pairing.deckId ||
      session.deck_version !== pairing.deckVersion ||
      toIso(session.expires_at) !== pairing.sessionExpiresAt
    ) {
      throw companionUnavailable();
    }
    await this.projection.getDeckProjection(pairing.sessionId, now);

    const credentialExpiresAt = new Date(
      Math.min(
        new Date(pairing.sessionExpiresAt).getTime(),
        now.getTime() + credentialTtlMs,
      ),
    );
    const ttlSeconds = Math.floor(
      (credentialExpiresAt.getTime() - now.getTime()) / 1_000,
    );
    if (ttlSeconds < 1) {
      throw companionUnavailable();
    }
    const pairingGeneration = await this.store.issueGeneration(
      pairing.sessionId,
      ttlSeconds,
    );
    const token = createCompanionAccessToken(
      this.config,
      {
        sessionId: pairing.sessionId,
        projectId: pairing.projectId,
        deckId: pairing.deckId,
        deckVersion: pairing.deckVersion,
        pairingGeneration,
        scopes: [...companionAccessScopes],
        expiresAt: credentialExpiresAt.toISOString(),
      },
      userAgent,
    );
    const credential = verifyCompanionAccessToken(
      this.config,
      token,
      userAgent,
      now,
    );
    if (!credential) {
      throw companionUnavailable();
    }
    return { token, credential };
  }

  async verifyCredential(
    token: string,
    userAgent: string,
    expectedSessionId?: string,
    now = new Date(),
  ): Promise<CompanionAccessTokenPayload | null> {
    const credential = verifyCompanionAccessToken(
      this.config,
      token,
      userAgent,
      now,
    );
    if (
      !credential ||
      (expectedSessionId && credential.sessionId !== expectedSessionId)
    ) {
      return null;
    }
    const [latestGeneration, session] = await Promise.all([
      this.store.getLatestGeneration(credential.sessionId),
      this.sessions.findActiveCompanionSession(credential.sessionId, now),
    ]);
    if (
      latestGeneration !== credential.pairingGeneration ||
      !session ||
      session.project_id !== credential.projectId ||
      session.deck_id !== credential.deckId ||
      session.deck_version !== credential.deckVersion
    ) {
      return null;
    }
    try {
      await this.projection.getDeckProjection(credential.sessionId, now);
      return credential;
    } catch {
      return null;
    }
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.store.revokeSession(sessionId);
  }

  async getStatus(sessionId: string) {
    const [generation, authorityEpochId, presence] = await Promise.all([
      this.store.getLatestGeneration(sessionId),
      this.store.getAuthority(sessionId),
      this.store.getPresence(sessionId),
    ]);
    return { generation, authorityEpochId, presence };
  }

  claimAuthority(
    sessionId: string,
    authorityEpochId: string,
  ): Promise<boolean> {
    return this.store.claimAuthority(sessionId, authorityEpochId);
  }

  heartbeatAuthority(
    sessionId: string,
    authorityEpochId: string,
  ): Promise<boolean> {
    return this.store.heartbeatAuthority(sessionId, authorityEpochId);
  }

  renewPresence(
    sessionId: string,
    presence: PresentationCompanionPresence,
  ): Promise<void> {
    return this.store.renewPresence(sessionId, presence);
  }

  clearPresence(sessionId: string): Promise<void> {
    return this.store.clearPresence(sessionId);
  }

  private async requireActiveSession(
    sessionId: string,
    expectedProjectId: string,
    now: Date,
  ) {
    const session = await this.sessions.findActiveCompanionSession(
      sessionId,
      now,
    );
    if (
      !session ||
      session.project_id !== expectedProjectId ||
      !session.deck_id ||
      !session.deck_version
    ) {
      throw companionUnavailable();
    }
    return session;
  }
}

function companionUnavailable() {
  return new NotFoundException("Presentation companion unavailable");
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
