export function countdown(iso) {
  if (!iso) return '';
  const diff = Math.max(0, new Date(iso) - Date.now());
  if (diff <= 0) return '已重置';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (days > 0) return days + '天 ' + hours + '小时';
  if (hours > 0) return hours + '小时 ' + mins + '分钟';
  return mins + '分钟';
}
