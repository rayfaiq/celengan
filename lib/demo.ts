export function isDemoUser(userId: string): boolean {
  const demoId = process.env.NEXT_PUBLIC_DEMO_USER_ID
  return !!demoId && userId === demoId
}
