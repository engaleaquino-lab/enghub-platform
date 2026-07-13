
import "./globals.css";

export const metadata = {
  title: "EngHub Platform",
  description: "Gestão inteligente para engenharia e construção civil"
};

export default function RootLayout({children}:{children:React.ReactNode}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
