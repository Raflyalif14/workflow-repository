export async function runNotificationBestEffort(
  context: string,
  operation: () => Promise<unknown>
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    console.error(`[NotificationDispatch] ${context} failed`, error);
  }
}
