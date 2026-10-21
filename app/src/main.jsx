import { StrictMode } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { AppProvider, useRoute } from "./state.jsx";
import { Footer, Header } from "./ui.jsx";
import { Account, Auditors, ClaimDetail, Claims, Docs, Home, How, Post } from "./pages.jsx";
// Creates the Reown AppKit modal when VITE_REOWN_PROJECT_ID is set.
import { wagmiAdapter } from "./wallet.js";

const queryClient = new QueryClient();
function WalletRoot({ children }) {
  if (!wagmiAdapter) return children;
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}

function App() {
  const [page, id] = useRoute();
  const view = {
    claims: id ? <ClaimDetail id={id} /> : <Claims />,
    auditors: <Auditors />,
    post: <Post />,
    account: <Account />,
    how: <How />,
    docs: <Docs slug={id} />,
  }[page] ?? <Home />;
  return (
    <>
      <Header page={page} />
      <main>{view}</main>
      <Footer />
    </>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <WalletRoot>
      <AppProvider>
        <App />
      </AppProvider>
    </WalletRoot>
  </StrictMode>,
);
