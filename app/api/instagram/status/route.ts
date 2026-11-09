import { readInstagramConnection } from "@/lib/instagram/config";
import { readQuotaIfConfigured } from "@/lib/instagram/publish";

export const runtime = "nodejs";

export async function GET() {
  const { connection } = readInstagramConnection();
  if (!connection.ready) {
    return Response.json(connection);
  }

  const quota = await readQuotaIfConfigured();
  return Response.json({
    ...connection,
    quota: quota.quota,
    quotaError: quota.quotaError,
  });
}
