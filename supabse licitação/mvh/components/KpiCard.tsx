
export default function KpiCard({title,value,caption}:{title:string,value:string,caption:string}){
  return <div className="card"><div className="muted">{title}</div><div className="value">{value}</div><div className="muted">{caption}</div></div>
}
