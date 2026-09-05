import type { ActivityQuery } from "@/lib/server/activity-store";

export function activityQueryFromUrl(url: string): ActivityQuery {
  const params=new URL(url).searchParams;
  const value=(name:string):string|undefined=>params.get(name) ?? undefined;
  const rawLimit=value("limit"), rawPage=value("page");
  return {
    statusGroup:value("statusGroup") ?? value("status"), source:value("source"),
    activityType:value("activityType") ?? value("type"), search:value("search"), asset:value("asset"),
    from:value("from") ?? value("dateFrom"), to:value("to") ?? value("dateTo"), sort:value("sort"),
    limit:rawLimit===undefined?undefined:Number(rawLimit), page:rawPage===undefined?undefined:Number(rawPage),
  };
}
