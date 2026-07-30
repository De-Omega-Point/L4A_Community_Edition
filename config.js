/*
 * Public Community Edition configuration.
 *
 * registrationEndpoint:
 *   A POST endpoint that accepts the registration payload documented in
 *   docs/REGISTRATION_API.md and returns { productId: "LFA-CE-XXXXXXXX" }.
 *   Leave blank during local development; a development Product ID is created
 *   locally on localhost/file previews.
 *
 * feedbackSurveyUrl:
 *   The single optional survey sent at approximately eight weeks. The app's
 *   quiet "Share Feedback" link uses the same URL.
 */
window.LFA_CONFIG = Object.freeze({
  registrationEndpoint: '',
  feedbackSurveyUrl: '',
  termsVersion: '1.0',
  privacyVersion: '1.0'
});
