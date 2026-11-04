import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { apiGet, apiPatch } from '@/lib/api/apiClient';
import type { NotificationListResponse } from '../types/notification.types';
export function usePortalNotifications() {
  const { user } = useAuth();
  const client = useQueryClient();
  const key = ['portal-notifications', user?.id];
  const query = useQuery({ queryKey: key, enabled: !!user, queryFn: () => apiGet<NotificationListResponse & { unread: number }>('/portal/notifications?limit=20'), refetchInterval: 30_000 });
  const read = useMutation({ mutationFn: (id: string) => apiPatch(`/portal/notifications/${id}/read`), onSuccess: () => client.invalidateQueries({ queryKey: key }) });
  return { query, read };
}
