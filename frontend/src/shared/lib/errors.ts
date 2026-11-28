

export function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Không thể hoàn tất yêu cầu. Vui lòng thử lại.";
}
