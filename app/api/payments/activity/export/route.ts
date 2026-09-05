import { activityEventsToCsv } from "@/lib/activity-export";
import { activityQueryFromUrl } from "@/lib/server/activity-http";
import { ActivityQueryError, queryActivityEventsForExport } from "@/lib/server/activity-store";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(request:Request){
  try{
    const query=activityQueryFromUrl(request.url);
    delete query.limit; delete query.page;
    const csv=activityEventsToCsv(queryActivityEventsForExport(query,1_000));
    return new Response(csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":'attachment; filename="agentpay-activity.csv"',"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
  }catch(error){
    if(error instanceof ActivityQueryError)return Response.json({error:error.message,code:"INVALID_ACTIVITY_QUERY"},{status:400});
    return Response.json({error:"Unable to export activity.",code:"ACTIVITY_EXPORT_FAILED"},{status:500});
  }
}
