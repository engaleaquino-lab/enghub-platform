import Link from "next/link";
import LogoutButton from "./LogoutButton";

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="logo">Eng<span>Hub</span></div>

      <nav className="nav">
        <Link href="/copiloto">Copiloto IA</Link>
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/contratos">Contratos</Link>
        <Link href="/medicoes">Medições</Link>
        <Link href="/financeiro">Financeiro</Link>
        <Link href="/biblioteca">Biblioteca Inteligente</Link>
        <Link href="/licitacoes">Licitações</Link>
        <Link href="/conhecimento">Conhecimento</Link>
        <Link href="/equipe">Equipe</Link>
        <Link href="/perfil">Perfil da empresa</Link>
        <Link href="/admin">Administração</Link>
        <Link href="/">Início</Link>
        <LogoutButton />
      </nav>
    </aside>
  );
}
