import { BrowserRouter, Route, Routes } from "react-router-dom";
import { SummaryPage } from "./pages/SummaryPage";
import { TranslatePage } from "./pages/TranslatePage";
import { UploadPage } from "./pages/UploadPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<UploadPage />} />
        <Route path="/documents/:id/summary" element={<SummaryPage />} />
        <Route path="/documents/:id/translate" element={<TranslatePage />} />
      </Routes>
    </BrowserRouter>
  );
}
