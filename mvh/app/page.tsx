
import Link from "next/link";

export default function Home(){
  return (
    <main className="login-wrap">
      <section className="login-card" style={{width:"min(760px,100%)"}}>
        <div className="logo">Eng<span>Hub</span></div>
        <h1 className="section-title">Plataforma de gestão para quem constrói.</h1>
        <p className="muted">Controle contratos, licitações, finanças e conhecimento técnico em um único ambiente.</p>
        <div className="grid two" style={{marginTop:20}}>
          <div className="card"><h3>EngHub Finance</h3><p className="muted">Financeiro e resultados por obra.</p></div>
          <div className="card"><h3>Gestão de Contratos</h3><p className="muted">Medições, aditivos, cronograma e documentos.</p></div>
          <div className="card"><h3>Licitações</h3><p className="muted">Editais, habilitação e prazos.</p></div>
          <div className="card"><h3>Central de Conhecimento</h3><p className="muted">Guias, modelos e casos reais.</p></div>
        </div>
        <div style={{display:"flex",gap:12,marginTop:20}}>
          <Link className="btn" href="/login">Entrar na plataforma</Link>
          <Link className="btn secondary" href="/dashboard">Ver demonstração</Link>
        </div>
      </section>
    </main>
  );
}
