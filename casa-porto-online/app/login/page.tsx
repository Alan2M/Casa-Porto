"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Mail, Waves } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/");
    });
  }, [router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) setMessage(error.message);
      else if (data.session) router.replace("/");
      else setMessage("Conta criada. Confira seu e-mail se a confirmação estiver ativada no Supabase.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage("Não foi possível entrar. Confira e-mail e senha.");
      else router.replace("/");
    }
    setLoading(false);
  }

  return (
    <main className="auth-shell">
      <section className="auth-visual">
        <div className="brand-mark"><Waves size={28} /> Casa Porto</div>
        <div>
          <span className="eyebrow light">GESTÃO DE TEMPORADA</span>
          <h1>Menos planilha.<br />Mais tranquilidade.</h1>
          <p>Reservas, entradas, saídas, pagamentos e limpeza em um só lugar — no celular ou computador.</p>
        </div>
        <div className="auth-quote">“Abra e saiba exatamente o que acontece com a casa hoje.”</div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <img src="/house.svg" width="52" height="52" alt="Casa Porto" />
          <span className="eyebrow">ACESSO SEGURO</span>
          <h2>{mode === "login" ? "Entrar no painel" : "Criar sua conta"}</h2>
          <p className="muted">Cada pessoa usa seu próprio acesso e compartilha os dados da mesma casa.</p>

          <form onSubmit={submit} className="form-stack">
            {mode === "signup" && (
              <label>Seu nome<input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ex.: Carlos" /></label>
            )}
            <label>E-mail<div className="input-icon"><Mail size={17} /><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="voce@email.com" /></div></label>
            <label>Senha<div className="input-icon"><KeyRound size={17} /><input type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Mínimo 6 caracteres" /></div></label>
            {message && <div className="notice">{message}</div>}
            <button className="btn primary full" disabled={loading}>{loading ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}</button>
          </form>

          <button className="text-btn" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>
            {mode === "login" ? "Primeiro acesso? Criar conta" : "Já tenho conta → entrar"}
          </button>
        </div>
      </section>
    </main>
  );
}
