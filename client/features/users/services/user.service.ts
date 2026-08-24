import type { User } from "../types/user.types";

/** Returns user's full name */
export function getUserFullName(user: User): string {
  return `${user.firstName} ${user.lastName}`;
}

/** Returns user initials for avatars */
export function getUserInitials(user: User): string {
  return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
}
