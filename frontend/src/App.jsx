// frontend/src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Markets from './pages/Markets'; 
import Trade from './pages/Trade'; // <--- Import Trade
import Navbar from './components/Navbar';
import ScrollToTop from './components/ScrollToTop';
import Footer from './components/Footer';

function App() {
  const user = useSelector((state) => state.auth.user);

  return (
    <BrowserRouter>
      <ScrollToTop />
      
      <div className="min-h-screen bg-[#0b0c0e] selection:bg-[#00D68F]/30">
        <Navbar />
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/markets" element={<Markets />} />
            
            {/* New Trade Route */}
            <Route path="/trade" element={<Trade />} /> 
            
            <Route 
              path="/login" 
              element={!user ? <Login /> : <Navigate to="/" />} 
            />
            <Route 
              path="/signup" 
              element={!user ? <Signup /> : <Navigate to="/" />} 
            />
            
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </BrowserRouter>
  );
}

export default App;