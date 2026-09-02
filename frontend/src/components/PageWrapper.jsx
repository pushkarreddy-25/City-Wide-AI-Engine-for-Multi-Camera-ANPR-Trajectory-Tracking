import { motion } from "framer-motion";

export function PageWrapper({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.25, ease: "easeInOut" }}
      style={{ width: "100%", minHeight: "100%", display: "flex", flexDirection: "column" }}
    >
      {children}
    </motion.div>
  );
}
