// Cognito Pre-Sign-Up trigger.
// Auto-confirm new accounts so there's no email/confirmation step for the common
// (no-email) username+password case. If a user chose to add an email (for recovery),
// auto-verify it so forgot-password can use it.
export const handler = async (event) => {
  event.response.autoConfirmUser = true;
  if (event.request.userAttributes && event.request.userAttributes.email) {
    event.response.autoVerifyEmail = true;
  }
  return event;
};
