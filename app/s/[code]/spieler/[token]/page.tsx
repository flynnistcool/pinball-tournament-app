// 📱 Handy-Seite eines Spielers (per QR-Code aus der Spielerliste im Admin-Bereich)
import PlayerPhone from "@/components/PlayerPhone";

export const dynamic = "force-dynamic";

export const metadata = { title: "Mein Match" };

export default function PlayerPhonePage({ params }: { params: { code: string; token: string } }) {
  return (
    <PlayerPhone
      code={String(params.code ?? "").toUpperCase()}
      token={decodeURIComponent(String(params.token ?? ""))}
    />
  );
}
