import { addProductBrandChrome, brandedErrorResponse, isHtmlNavigation } from "../server/product-brand.mjs";
import { registrationNotificationHook } from "../server/registration/email-notifications.mjs";
/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { setDbEnv } from "../db";
import { handleRegistrationRequest, registrationAccess } from "../server/registration/provider.mjs";
import { canonicalPath, requiresRegistration, registrationRequiredResponse } from "../server/registration/gate.mjs";
import { ownerRegistrations } from "../server/registration/owner.mjs";
import protectedAssets from "virtual:protected-community-assets";
import { protectedCommunityResponse } from "../server/community-assets.mjs";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  REGISTRATION_EMAIL_READY?: string;
  REGISTRATION_EMAIL_PROVIDER?: string;
  REGISTRATION_EMAIL_MODE?: string;
  RESEND_API_KEY?: string;
  RESEND_ACCOUNT_EMAIL?: string;
  RESEND_SENDER_VERIFIED?: string;
  REGISTRATION_EMAIL_CONTRACT?: string;
  REGISTRATION_EMAIL_IDEMPOTENCY?: string;
  REGISTRATION_EMAIL_TOKEN?: string;
  REGISTRATION_EMAIL_FROM?: string;
  REGISTRATION_EMAIL_ENDPOINT?: string;
  REGISTRATION_EMAIL_ORIGIN?: string;

  REGISTRATION_OWNER_SITE_USER_ID?: string;
  REGISTRATION_OWNER_ACCESS_READY?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    setDbEnv(env);
    const url = new URL(request.url);
    const path = canonicalPath(url.pathname);
    if (!path) return brandedErrorResponse(request, "Invalid path", 400, "no-store");
    if (path !== url.pathname) {
      url.pathname = path;
      request = new Request(url, request);
    }
    if (path === "/api/community-members" || path === "/api/community-members/") {
      return Response.json({ message: "Use the single registration form. Existing membership records are unchanged." }, { status: 410, headers: { "Cache-Control": "no-store" } });
    }
    if (path === "/api/registrations" || path === "/api/registration-events") {
      return handleRegistrationRequest(request, env.DB, { afterRegistration: registrationNotificationHook(env, ctx) });
    }
    if (path === "/owner/registrations" || path === "/owner/registrations/") {
      return ownerRegistrations(request, env);
    }
    if (requiresRegistration(path)) {
      try {
        if (!await registrationAccess(request, env.DB)) return registrationRequiredResponse(request, path);
      } catch {
        return brandedErrorResponse(request, "Registration access could not be checked. Please try again later.", 503, "no-store");
      }
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => {
          const assetPath = canonicalPath(new URL(path, request.url).pathname);
          if (!assetPath || requiresRegistration(assetPath)) return Promise.resolve(new Response("Not available", { status: 403 }));
          return env.ASSETS.fetch(new Request(new URL(assetPath, request.url)));
        },
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    // Consent notices live outside the legacy /community/ cache scope.
    if (path.startsWith("/registration/notices/")) {
      const notice = await env.ASSETS.fetch(request);
      const headers = new Headers(notice.headers);
      headers.set("Cache-Control", "no-store");
      const response = new Response(notice.body, { status: notice.status, headers });
      // Preserve historical notice files/legal content; add surrounding product chrome.
      const historical = /^\/registration\/notices\/2026-10-17-registration-1\/(?:terms|privacy)(?:\.html)?$/u.test(path);
      return historical && notice.status === 200
        ? addProductBrandChrome(response, { head: request.method === "HEAD" }) : response;
    }
    // The same registration UI is available inside installed PWA scope. Never
    // serve it from static assets or cache receipt-dependent registration state.
    if (path === "/register" || path === "/register/" || path === "/community/register" || path === "/community/register/" || path === "/community/welcome" || path === "/community/welcome/") {
      const response = await handler.fetch(request, env, ctx);
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "private, no-store");
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }
    // Community is a static PWA, not a Next route. Bypass framework trailing-
    // slash normalization after authorization so relative modules stay correct.
    if (path === "/community") return new Response(null, { status: 303, headers: { Location: "/community/", "Cache-Control": "private, no-store" } });
    if (requiresRegistration(path)) return protectedCommunityResponse(request, path, protectedAssets);
    const response = path.startsWith("/community/")
      ? await env.ASSETS.fetch(request)
      : await handler.fetch(request, env, ctx);
    return response.status >= 400 && isHtmlNavigation(request)
      ? addProductBrandChrome(response, { head: request.method === "HEAD" }) : response;
  },
};

export default worker;
