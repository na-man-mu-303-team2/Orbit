import {
  authResponseSchema,
  loginRequestSchema,
  logoutResponseSchema,
  meResponseSchema,
  registerRequestSchema
} from "@orbit/shared";
import type { MeResponse } from "@orbit/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, KeyRound, LogIn, LogOut, UserPlus } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

type AuthMode = "login" | "register";
type ResponseSchema<T> = {
  parse(value: unknown): T;
};

const authBasePath = "/api/v1/auth";
const authSessionQueryKey = ["auth", "session"] as const;

export function AuthPanel() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const session = useQuery({
    queryKey: authSessionQueryKey,
    queryFn: fetchSession,
    retry: false
  });

  const authMutation = useMutation({
    mutationFn: async () => {
      const schema = mode === "register" ? registerRequestSchema : loginRequestSchema;
      const payload = schema.parse({ email, password });
      return requestAuth(
        mode === "register" ? "register" : "login",
        {
          body: JSON.stringify(payload),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        },
        authResponseSchema
      );
    },
    onError: (error: Error) => {
      setFormError(error.message);
    },
    onSuccess: async () => {
      setFormError(null);
      setPassword("");
      await queryClient.invalidateQueries({ queryKey: authSessionQueryKey });
    }
  });

  const logoutMutation = useMutation({
    mutationFn: async () =>
      requestAuth(
        "logout",
        {
          method: "POST"
        },
        logoutResponseSchema
      ),
    onSuccess: async () => {
      setFormError(null);
      await queryClient.invalidateQueries({ queryKey: authSessionQueryKey });
    },
    onError: (error: Error) => {
      setFormError(error.message);
    }
  });

  const sessionUntil = useMemo(() => {
    if (!session.data?.expiresAt) {
      return "";
    }

    return new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(session.data.expiresAt));
  }, [session.data?.expiresAt]);

  const isSubmitting = authMutation.isPending || logoutMutation.isPending;
  const isSignedIn = session.isSuccess;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    authMutation.mutate();
  }

  return (
    <article className="panel auth-panel">
      <div className="auth-heading">
        <div>
          <p className="panel-kicker">Auth</p>
          <h2>{isSignedIn ? "Signed in" : "Account"}</h2>
        </div>
        <KeyRound size={20} />
      </div>

      {isSignedIn ? (
        <div className="session-card">
          <div>
            <span>User</span>
            <strong>{session.data.user.email}</strong>
          </div>
          <div>
            <span>Session</span>
            <strong>{sessionUntil}</strong>
          </div>
          <button
            className="secondary-action"
            type="button"
            disabled={isSubmitting}
            onClick={() => logoutMutation.mutate()}
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      ) : (
        <>
          <div className="segmented-control" role="tablist" aria-label="Auth mode">
            <button
              type="button"
              className={mode === "login" ? "active" : ""}
              onClick={() => {
                setMode("login");
                setFormError(null);
              }}
            >
              <LogIn size={16} />
              Login
            </button>
            <button
              type="button"
              className={mode === "register" ? "active" : ""}
              onClick={() => {
                setMode("register");
                setFormError(null);
              }}
            >
              <UserPlus size={16} />
              Sign up
            </button>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label>
              <span>Email</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label>
              <span>Password</span>
              <input
                type="password"
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                maxLength={128}
                required
              />
            </label>
            {formError ? (
              <p className="auth-error" role="alert">
                <AlertCircle size={16} />
                {formError}
              </p>
            ) : null}
            <button className="primary-action" type="submit" disabled={isSubmitting}>
              {mode === "register" ? <UserPlus size={18} /> : <LogIn size={18} />}
              {mode === "register" ? "Create account" : "Login"}
            </button>
          </form>
        </>
      )}
    </article>
  );
}

async function fetchSession(): Promise<MeResponse> {
  return requestAuth(
    "me",
    {
      method: "GET"
    },
    meResponseSchema
  );
}

async function requestAuth<T>(
  path: string,
  init: RequestInit,
  schema: ResponseSchema<T>
): Promise<T> {
  const response = await fetch(`${authBasePath}/${path}`, {
    credentials: "include",
    ...init
  });
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(readErrorMessage(body));
  }

  return schema.parse(body);
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readErrorMessage(body: unknown): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "message" in body &&
    typeof body.message === "string"
  ) {
    return body.message;
  }

  return "Request failed";
}
