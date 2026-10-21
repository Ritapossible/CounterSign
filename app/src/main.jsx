import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { AppProvider, useRoute } from "./state.jsx";
import { Footer, Header } from "./ui.jsx";
import { Account, Auditors, ClaimDetail, Claims, Home, How, Post } from "./pages.jsx";

function App() {
  const [page, id] = useRoute();
  const view = {
    claims: id ? <ClaimDetail id={id} /> : <Claims />,
    auditors: <Auditors />,
    post: <Post />,
    account: <Account />,
    how: <How />,
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
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);
