
import AppShell from "@/components/AppShell";

export default function Conhecimento(){
  return (
    <AppShell>
      <div className="topbar"><div><h1 className="section-title">Central de Conhecimento</h1><div className="muted">Guias, modelos e casos reais</div></div><span className="badge">9 conteúdos</span></div>
      <input className="input" placeholder="Pesquise por licitação, BDI, medição, cobrança..." />
      <div className="grid three" style={{marginTop:18}}>
        {[
          ["Primeira licitação","Roteiro de entrada no mercado público."],
          ["Como ler um edital","Checklist para não perder exigências."],
          ["Fluxo de caixa da obra","Controle de entradas e saídas."],
          ["Como organizar uma medição","Execução, memória de cálculo e faturamento."],
          ["Cobrança de pagamento atrasado","Estrutura de cobrança formal."],
          ["Controle de aditivos","Valor, prazo, status e formalização."]
        ].map(([t,d])=><div className="card" key={t}><h3>{t}</h3><p className="muted">{d}</p></div>)}
      </div>
    </AppShell>
  );
}
