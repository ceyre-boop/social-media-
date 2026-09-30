import { Redirect } from 'expo-router';

/** Old URL from before the five-tab shell. */
export default function ProfileRedirect() {
  return <Redirect href="/you" />;
}
