import "../globals.css";

export const metadata = {
  title: "Recording",
};

export default function OverlayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body className="bg-transparent antialiased">
        {children}
      </body>
    </html>
  );
}

