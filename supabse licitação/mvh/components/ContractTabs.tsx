import Link from "next/link";
export default function ContractTabs({id}:{id:string}){return <div className="tabs"><Link href={`/contratos/${id}`}>Resumo</Link><Link href={`/contratos/${id}/medicoes`}>Medições</Link><Link href={`/contratos/${id}/aditivos`}>Aditivos</Link><Link href={`/contratos/${id}/documentos`}>Documentos</Link></div>}
