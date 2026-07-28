import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Sparkles } from "lucide-react";
import { motion } from "framer-motion";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-4"
      >
        <Sparkles className="h-12 w-12 text-primary/20 mx-auto" />
        <h1 className="text-6xl font-extrabold gradient-neon-text">404</h1>
        <p className="text-lg text-muted-foreground">This page doesn't exist in any dimension.</p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold gradient-neon text-white hover:opacity-90 transition-all duration-300 glow-purple"
        >
          Return Home
        </Link>
      </motion.div>
    </div>
  );
};

export default NotFound;