import {
  authResponseSchema,
  authSessionResponseSchema,
  loginRequestSchema,
  logoutResponseSchema,
  signupRequestSchema,
  type LoginRequestDto,
  type SignupRequestDto,
} from "@itecify/shared/auth";
import { fetchApi } from "./client.js";

export function signup(input: SignupRequestDto) {
  return fetchApi(
    "/auth/signup",
    {
      method: "POST",
      body: JSON.stringify(signupRequestSchema.parse(input)),
    },
    authResponseSchema,
  );
}

export function login(input: LoginRequestDto) {
  return fetchApi(
    "/auth/login",
    {
      method: "POST",
      body: JSON.stringify(loginRequestSchema.parse(input)),
    },
    authResponseSchema,
  );
}

export function logout() {
  return fetchApi(
    "/auth/logout",
    {
      method: "POST",
    },
    logoutResponseSchema,
  );
}

export function getCurrentUser() {
  return fetchApi(
    "/auth/me",
    {
      method: "GET",
    },
    authSessionResponseSchema,
  );
}
