import { Redirect } from 'expo-router';

/** Old URL from before the five-tab shell. */
export default function NewRedirect() {
  return <Redirect href="/create" />;
}
