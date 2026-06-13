/**
 * Vercel Ignored Build Step.
 * Exit 0 = skip deployment, exit 1 = proceed with build.
 * @see https://vercel.com/docs/project-configuration/git-settings#ignored-build-step
 */

const ref = process.env.VERCEL_GIT_COMMIT_REF ?? "";

// Mobile rider app is built with Expo/EAS, not Vercel. Skip preview deploys for mobile branches.
if (/^feature\/mobile/i.test(ref)) {
  console.log(`[vercel] Skipping build for mobile feature branch: ${ref}`);
  process.exit(0);
}

process.exit(1);
