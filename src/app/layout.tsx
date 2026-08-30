import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ፍኖተ ሰላም ሰንበት ትምህርት ቤት | የዜማ መሣሪያዎች ማሰልጠኛ ምዝገባ",
  description: "ቦሌ ሰሚት መካነ ሰላም መድኃኔዓለም እና መጥምቀ መለኮት ቅዱስ ዮሐንስ ቤተክርስቲያን ፍኖተ ሰላም ሰንበት ትምህርት ቤት — የዜማ መሣሪያዎች (በገና፣ ከበሮ፣ ማሲንቆ፣ መለከት፣ ነጋሪት) ማሰልጠኛ የተማሪዎች ምዝገባ ሥርዓት",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="am" className="h-full bg-slate-50">
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-full flex flex-col antialiased text-slate-800`}>
        {children}
      </body>
    </html>
  );
}
