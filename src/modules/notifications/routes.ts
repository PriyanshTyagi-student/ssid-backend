import type { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../middleware/auth.js';
import { successResponse } from '../../utils/response.js';

// In-memory / initial store for user notifications
interface NotificationItem {
  id: string;
  userId?: string;
  title: string;
  message: string;
  type: 'report_approved' | 'report_rejected' | 'reminder' | 'system';
  reportId?: string;
  isRead: boolean;
  createdAt: string;
}

const mockNotifications: NotificationItem[] = [
  {
    id: 'notif-1',
    title: 'Daily Material Report Approved',
    message: 'Your Daily Material Report for Metro Line Sector 4 was verified and approved.',
    type: 'report_approved',
    isRead: false,
    createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  },
  {
    id: 'notif-2',
    title: 'Daily Labor Submission Reminder',
    message: 'Please submit your Daily Labor Report for today before 18:00 hrs.',
    type: 'reminder',
    isRead: false,
    createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
  },
  {
    id: 'notif-3',
    title: 'System Operational Update',
    message: 'Offline draft sync is active. Any reports filled without internet will sync automatically.',
    type: 'system',
    isRead: true,
    createdAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
  },
];

export const notificationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // GET /api/v1/notifications
  fastify.get(
    '/',
    {
      schema: {
        description: 'Get user notifications list',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      return reply.send(successResponse(mockNotifications, 'Notifications retrieved'));
    }
  );

  // PATCH /api/v1/notifications/:id/read
  fastify.patch(
    '/:id/read',
    {
      schema: {
        description: 'Mark notification as read',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const notif = mockNotifications.find((n) => n.id === id);
      if (notif) {
        notif.isRead = true;
      }
      return reply.send(successResponse({ id, isRead: true }, 'Notification marked as read'));
    }
  );

  // POST /api/v1/notifications/read-all
  fastify.post(
    '/read-all',
    {
      schema: {
        description: 'Mark all notifications as read',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      mockNotifications.forEach((n) => {
        n.isRead = true;
      });
      return reply.send(successResponse({ count: mockNotifications.length }, 'All notifications marked as read'));
    }
  );
};
