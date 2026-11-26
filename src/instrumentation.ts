import type {Instrumentation} from 'next';

// Emails the team when a page or API route fails on the server, at most once every 30 minutes per error.
const lastSent = new Map<string, number>();

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const err = error as Error & {digest?: string};
  const key = `${request.path}|${err.message}`.slice(0, 300);
  if (Date.now() - (lastSent.get(key) || 0) < 30 * 60_000) return;
  lastSent.set(key, Date.now());
  try {
    const {notifyServerError} = await import('@/lib/alerts');
    await notifyServerError({path: request.path, method: request.method, message: err.message || String(error), digest: err.digest || null, stack: err.stack || '', kind: context.routeType});
  } catch (alertError) {
    console.error('[Alert]', alertError);
  }
};
