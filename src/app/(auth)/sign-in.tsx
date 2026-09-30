import { Redirect } from 'expo-router';

/** Old links and the signed-out post gate point here; the landing lives at /welcome. */
export default function SignInRedirect() {
  return <Redirect href="/welcome" />;
}
