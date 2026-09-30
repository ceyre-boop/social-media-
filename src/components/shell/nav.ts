/** Which of the five tabs a pathname belongs to. `you` includes profile-edit. */
export function navState(pathname: string) {
  return {
    home: pathname === '/',
    discover: pathname.startsWith('/discover'),
    create: pathname.startsWith('/create'),
    live: pathname.startsWith('/live'),
    you:
      pathname.startsWith('/you') ||
      pathname.startsWith('/profile-edit') ||
      pathname.startsWith('/settings'),
  };
}
