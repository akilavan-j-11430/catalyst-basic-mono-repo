import { MonitorDetailPage } from "@/components/monitoring/monitor-detail-page";

export default async function MonitorPage({ params }: PageProps<"/monitors/[monitorId]">) {
  const { monitorId } = await params;
  return <MonitorDetailPage monitorId={monitorId} />;
}
