/** Primary support inbox — matches solviosystems.com domain. */
export const SUPPORT_EMAIL = "hello@solviosystems.com";

export const SIGNUP_EMAIL_PLACEHOLDER = "you@yourvenue.co.uk";

export function supportMailtoHref(): string {
  return `mailto:${SUPPORT_EMAIL}`;
}
