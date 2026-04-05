"use client";

import { useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useInView,
} from "framer-motion";

/* ------------------------------------------------------------------ */
/*  Spring config                                                     */
/* ------------------------------------------------------------------ */
const smooth = { stiffness: 80, damping: 30, mass: 0.5 };

/* ------------------------------------------------------------------ */
/*  Animated text reveals                                             */
/* ------------------------------------------------------------------ */

function RevealText({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-15%" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30, filter: "blur(10px)" }}
      animate={
        isInView
          ? { opacity: 1, y: 0, filter: "blur(0px)" }
          : { opacity: 0, y: 30, filter: "blur(10px)" }
      }
      transition={{
        duration: 0.9,
        delay,
        ease: [0.25, 0.1, 0.25, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function WordReveal({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-15%" });
  const words = text.split(" ");

  return (
    <p ref={ref} className={className}>
      {words.map((word, i) => (
        <motion.span
          key={i}
          className="inline-block mr-[0.3em]"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{
            duration: 0.5,
            delay: i * 0.06,
            ease: [0.25, 0.1, 0.25, 1],
          }}
        >
          {word}
        </motion.span>
      ))}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/*  SVG Map of Southeast Asia — full width                            */
/* ------------------------------------------------------------------ */

function SeaMap({ className = "" }: { className?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-10%" });

  const cities = [
    { name: "SINGAPORE", x: 299, y: 461, r: 7, opacity: 1, delay: 0.3 },
    { name: "JAKARTA", x: 360, y: 583, r: 6, opacity: 0.7, delay: 0.5 },
    { name: "BANGKOK", x: 232, y: 261, r: 6, opacity: 0.6, delay: 0.7 },
    { name: "MANILA", x: 647, y: 248, r: 5, opacity: 0.45, delay: 0.9 },
    { name: "HO CHI MINH", x: 357, y: 309, r: 5, opacity: 0.45, delay: 1.1 },
    { name: "KUALA LUMPUR", x: 256, y: 432, r: 5, opacity: 0.35, delay: 1.3 },
  ];

  const connections = [
    [0, 1], [0, 2], [0, 4], [0, 5], [2, 4], [4, 3],
  ];

  const landFill = "#0a2a1a";
  const landStroke = "#1a4a30";
  const oceanFill = "#060d18";

  /* GeoJSON-derived country paths (Natural Earth data, Mercator projection) */
  const countries = [
    { name: "Myanmar", delay: 0.1, d: "M212.2,157.5 L200.3,164.5 L186,165.3 L176.8,182.7 L168.2,185.6 L199.2,222.1 L191.8,236.1 L184.8,239.1 L203.1,260 L205.1,276.5 L213.1,291.2 L192.1,322.7 L190.1,310.8 L196.4,298.4 L189.5,288.9 L191.2,271.4 L183,263 L172.7,223.4 L163.9,210 L127.5,229.6 L103.5,224.4 L110.5,204.4 L106.3,189.3 L90.4,170.8 L92.9,165 L81,162.9 L66.6,149.7 L65.3,136.8 L72.4,139.2 L72.8,127.7 L82.8,123.8 L80.7,117 L85.2,111.5 L86,94.8 L101.9,98.5 L110.9,85.2 L112,77.4 L123.1,63.9 L122.5,54.6 L148.8,43.5 L163.3,46.4 L161.6,36.5 L168.7,33.6 L167.2,27.5 L179.1,26.3 L185.9,35.7 L194.7,39.6 L194.5,65.2 L175.3,78.7 L172.8,97.8 L194.3,95.1 L199.1,109.9 L211.9,113 L206,126.4 L229.9,135.4 L244.8,130.8 L245.4,137.4 L223.8,153.8 L212.2,157.5 Z" },
    { name: "Thailand", delay: 0.12, d: "M273.9,286.4 L255.7,279 L238.3,279.3 L241.3,266.7 L223.4,266.8 L221.8,284.5 L204.3,322.3 L205.7,333.9 L218.9,334.4 L230.7,363.1 L242.1,372.3 L254.4,374.2 L264.9,382.5 L258.2,389.2 L244.8,391.1 L243.2,382.8 L226.7,375.8 L223.2,378.6 L215.2,372.4 L211.7,364.5 L191.1,347.7 L187.7,357.2 L183.9,348.2 L192.1,322.7 L213.1,291.2 L205.1,276.5 L203.1,260 L184.8,239.1 L191.8,236.1 L199.2,222.1 L168.2,185.6 L176.8,182.7 L186,165.3 L200.3,164.5 L223.8,153.8 L232.6,158.8 L233.7,168.5 L247.4,169.2 L242.4,186.2 L242.9,200.6 L264.3,191 L270.4,193.9 L282.3,193.4 L286.3,187.8 L301.7,188.9 L317.1,202 L318.4,217.9 L334.8,231.9 L333.9,245.6 L327.3,252.8 L308.3,250.5 L282.1,253.6 L269.1,267 L273.9,286.4 Z" },
    { name: "Laos", delay: 0.14, d: "M327.3,252.8 L333.9,245.6 L334.8,231.9 L318.4,217.9 L317.1,202 L301.7,188.9 L286.3,187.8 L282.3,193.4 L270.4,193.9 L264.3,191 L242.9,200.6 L242.4,186.2 L247.4,169.2 L233.7,168.5 L232.6,158.8 L223.8,153.8 L245.4,137.4 L247.2,141.2 L258,141.6 L254.9,123.2 L265.5,120.8 L286.4,148.2 L311.4,148.3 L319.3,162.4 L306.3,166.6 L300.5,172.4 L324.8,182 L354.4,215.3 L369.8,226.5 L374.9,237.9 L371.2,254 L353.2,248 L344,259.1 L327.3,252.8 Z" },
    { name: "Cambodia", delay: 0.16, d: "M292.4,311.5 L273.9,286.4 L269.1,267 L282.1,253.6 L308.3,250.5 L327.3,252.8 L344,259.1 L353.2,248 L371.2,254 L375.9,264.7 L373.4,284 L339.3,296.4 L348.2,306.2 L326.9,307.3 L309.4,313.8 L292.4,311.5 Z" },
    { name: "Vietnam", delay: 0.15, d: "M384.7,135.5 L357.6,149.3 L340.7,164.6 L336.3,175.7 L370.8,213.8 L389.2,223.7 L401.5,236.7 L410.8,266.5 L408.1,294.8 L367.9,315.8 L326.1,344.2 L318.7,333.9 L324.4,323 L309.4,313.8 L326.9,307.3 L348.2,306.2 L339.3,296.4 L373.4,284 L375.9,264.7 L371.2,254 L374.9,237.9 L369.8,226.5 L354.4,215.3 L324.8,182 L300.5,172.4 L306.3,166.6 L319.3,162.4 L311.4,148.3 L286.4,148.2 L265.5,120.8 L276.3,116.9 L312.2,115.1 L329.5,106.6 L339.3,112.6 L357.9,115.5 L354.7,124.8 L364.3,131.4 L384.7,135.5 Z" },
    { name: "Malaysia-Peninsula", delay: 0.2, d: "M243.2,382.8 L244.8,391.1 L258.2,389.2 L264.9,382.5 L281.5,393.8 L290,404.6 L292.5,437.8 L299.6,442.3 L307.2,461.9 L292.8,463 L249.6,438.3 L247.3,430.1 L235.5,419.3 L232.7,406 L225.4,397.2 L227.6,385.5 L223.2,378.6 L226.7,375.8 L243.2,382.8 Z" },
    { name: "Malaysia-Borneo", delay: 0.21, d: "M599.1,410.6 L584.2,416.1 L543.3,413.4 L536.2,431.7 L528.4,437.3 L518,459.7 L501.5,463.2 L482.3,458.6 L472.6,460.1 L460.8,468.2 L447.8,467 L434.7,470.3 L420.8,461.2 L417.5,450.5 L432.3,456 L448,453 L452.1,439.3 L485.1,432.8 L509.6,409.9 L518.8,418.2 L523.1,412.7 L532.8,413.2 L534.9,395 L550.5,383.8 L560.7,371.2 L568.9,371.2 L579.3,379.3 L580.3,386.3 L610.5,395.7 L609.1,402 L595.5,402.8 L599.1,410.6 Z" },
    { name: "Brunei", delay: 0.22, d: "M509.6,409.9 L517.6,403.8 L534.9,395 L532.8,413.2 L523.1,412.7 L518.8,418.2 L509.6,409.9 Z" },
    { name: "Philippines", delay: 0.18, d: "M653.9,184.7 L666.4,189.3 L672.7,185.1 L671.2,195.8 L678.2,207.4 L672.8,220.8 L660.9,226.1 L657.7,239.1 L662.2,251.9 L681.9,251.8 L707.3,260.7 L705.3,269.5 L712,273.4 L709.9,280.8 L694,272.9 L686.6,264.4 L681.3,270.3 L668.4,260.7 L650,263.1 L639.9,259.5 L640.9,252.9 L647.3,248.8 L641.2,245 L638.6,250.8 L628.6,241.6 L624.8,219.1 L633,224.4 L635.1,199.2 L641.7,184.6 L653.9,184.7 Z M738.8,286.8 L744.5,304.8 L728.8,300.5 L734.2,315.9 L724.6,319.5 L723.7,308.2 L717.6,307.3 L714.4,297.6 L726.4,298.9 L726.1,292.8 L713.7,280.5 L733.2,280.8 L738.8,286.8 Z M665.4,291.2 L677.5,296.2 L690.4,296.2 L690,302.9 L667.8,314.6 L665.4,291.2 Z M707.9,317.2 L687.9,337.4 L675.4,326.3 L684.7,317.5 L686.9,307.5 L698.1,306.5 L694.9,317.4 L709.9,301.8 L707.9,317.2 Z M756.5,347.2 L759.8,366.9 L752.8,381.7 L745.4,365.3 L736,373.4 L742.4,385.3 L736.6,392.9 L712.7,383.5 L707,371.9 L713.2,364.2 L700.4,356.6 L694,363.3 L684.5,362.6 L669.4,371.6 L666.1,366.9 L674.1,353.3 L697.9,342.7 L705.1,350 L720.5,345.6 L723.8,338.4 L738.1,338 L736.9,325.5 L753.4,333.2 L756.5,347.2 Z" },
    { name: "Indonesia-Sumatra", delay: 0.22, d: "M339.4,577.1 L317,577.4 L299.9,563.9 L273.9,550.8 L249.8,527.9 L224.3,493.3 L206.5,479.8 L193.1,453.4 L174.8,443.3 L164.2,429.5 L127.7,402.7 L125.9,394.5 L170.4,398.3 L234.4,449 L255.1,449.2 L272.1,460.2 L283.8,473.7 L299.3,481.1 L291.2,494.2 L310.1,500.3 L320.6,520.5 L335.5,521.9 L345.3,532.1 L340.3,552.1 L339.4,577.1 Z" },
    { name: "Indonesia-Java", delay: 0.25, d: "M396.4,592 L435.2,593.6 L439.7,586.9 L477.3,594.7 L484.7,605.1 L515.1,608.1 L540,617.6 L516.9,623.8 L494.6,617.3 L455.2,616.5 L397.8,605.9 L389.3,607.9 L352.4,601.3 L348.8,594.3 L330.3,593.2 L344.2,577.8 L368.8,578.7 L393.6,586.2 L396.4,592 Z" },
    { name: "Indonesia-Borneo", delay: 0.24, d: "M584,453.3 L606.8,468.2 L582.8,470.1 L576,481.1 L576.9,495.7 L557.4,506.7 L556.8,522.8 L549,547.4 L546,541.7 L523,548.9 L514.9,539.1 L500.5,538.2 L490.4,533 L466.2,538.8 L458.8,531 L428.8,530 L425.7,508.4 L415.6,504 L405.9,490.2 L403,476.1 L405.4,461.2 L417.5,450.5 L420.8,461.2 L434.7,470.3 L447.8,467 L460.8,468.2 L472.6,460.1 L482.3,458.6 L501.5,463.2 L518,459.7 L528.4,437.3 L536.2,431.7 L543.3,413.4 L584.2,416.1 L572.6,430.7 L587.6,445.9 L584,453.3 Z" },
    { name: "Indonesia-Sulawesi", delay: 0.26, d: "M733.5,459.9 L717.2,475.9 L701.9,479 L682.4,475.8 L630.9,479 L628,491.2 L646.1,505.5 L657.1,498.2 L694.9,492.7 L693.2,500.1 L684.4,497.8 L675.6,507.2 L657.7,513.5 L676.9,534.1 L673.2,539.6 L691.5,558.2 L691.3,568.8 L680.5,573.6 L672.5,567.9 L682.3,554.7 L662.4,560.9 L657.4,556.5 L660,550.3 L645.4,540.8 L646.9,525.1 L633.3,530 L635.9,571.8 L623,574.2 L614.3,569.5 L620.1,554.6 L617,539.1 L608.4,539 L602.1,527.9 L610.5,517.4 L627.9,473.7 L645.1,461.7 L661,466.4 L686.5,468.7 L709.9,468 L729.9,456.3 L733.5,459.9 Z" },
    { name: "Indonesia-SmallIslands", delay: 0.27, d: "M803.4,464.5 L802.3,478.6 L791.9,477 L788.8,486.8 L797.1,495.3 L791.5,497.3 L783.3,487.1 L777.2,466.5 L781.3,453.6 L788.1,447.7 L789.5,456.5 L801.5,458 L803.4,464.5 Z M774.2,538.5 L766.6,543.9 L752.6,540.9 L748.6,534 L769.2,533.2 L774.2,538.5 Z M839.6,532.6 L846.9,544.9 L829.8,538.3 L787.4,537.4 L792.2,528.6 L817.2,527.9 L839.6,532.6 Z M686,613.2 L683.1,622.1 L652.6,626.7 L625.6,624.7 L625.5,618.8 L641.6,615.5 L654.4,620.3 L686,613.2 Z M584.5,613.2 L591.9,617.5 L604.4,616.2 L609.4,623 L561,628.3 L568,619 L579.1,618.9 L584.5,613.2 Z M641.7,647.7 L633.1,648.1 L606.2,636.8 L625.1,633.6 L642.9,643.4 L641.7,647.7 Z M717.1,646.1 L699.8,649.7 L697.3,647.8 L707.9,632.5 L727.9,626.1 L730.4,634.1 L717.1,646.1 Z" },
    { name: "Taiwan", delay: 0.11, d: "M663.2,89.8 L642.3,128.8 L631.6,115.2 L629.3,103.3 L641.2,87.4 L657.5,75.2 L666.7,80 L663.2,89.8 Z" },
    { name: "China-Hainan", delay: 0.1, d: "M431.2,181.8 L413.6,189.6 L397,184.6 L396.4,170.7 L406.4,163.4 L440.2,159.3 L444.8,165.5 L435.9,172.5 L431.2,181.8 Z" },
  ];

  /* Southern China coast (visible portion) */
  const chinaCoast = "M631.8,-70.8 L639.7,-55 L665.9,-27.8 L665.5,-15.9 L652.8,-11.5 L657.6,-2.9 L669.6,2.1 L661.3,28 L650,29.5 L599.9,87.3 L543.8,115.7 L520.9,117.6 L508.5,124.7 L501.5,119.5 L490,127.5 L461.7,135.6 L440.2,138 L433.3,155.1 L422.1,156 L416.7,144.3 L421.5,138.1 L394.3,132.9 L384.7,135.5 L364.3,131.4 L354.7,124.8 L357.9,115.5 L339.3,112.6 L329.5,106.6 L312.2,115.1 L276.3,116.9 L254.9,123.2 L258,141.6 L247.2,141.2 L244.8,130.8 L229.9,135.4 L206,126.4 L211.9,113 L199.1,109.9 L194.3,95.1 L172.8,97.8 L175.3,78.7 L194.5,65.2 L194.7,39.6 L185.9,35.7 L179.1,26.3 L145.3,25 L152.2,18.3 L142.7,8.3 L128.2,15 L111.2,11.1";

  return (
    <div ref={ref} className={className}>
      <svg viewBox="60 30 800 660" className="w-full h-full">
        <defs>
          <radialGradient id="city-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="city-glow-bright" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="map-vignette" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="transparent" stopOpacity="0" />
            <stop offset="70%" stopColor="transparent" stopOpacity="0" />
            <stop offset="100%" stopColor="#050505" stopOpacity="0.9" />
          </radialGradient>
          <filter id="soft-glow">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="land-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Ocean background */}
        <rect x="60" y="30" width="800" height="660" fill={oceanFill} rx="8" />

        {/* Subtle grid — latitude/longitude lines */}
        {Array.from({ length: 16 }).map((_, i) => (
          <line
            key={`grid-v-${i}`}
            x1={120 + i * 46}
            y1={30}
            x2={120 + i * 46}
            y2={690}
            stroke="#1a3050"
            strokeWidth="0.3"
            opacity="0.25"
          />
        ))}
        {Array.from({ length: 14 }).map((_, i) => (
          <line
            key={`grid-h-${i}`}
            x1={60}
            y1={80 + i * 46}
            x2={860}
            y2={80 + i * 46}
            stroke="#1a3050"
            strokeWidth="0.3"
            opacity="0.25"
          />
        ))}

        {/* ---- LANDMASSES — GeoJSON-derived accurate shapes ---- */}

        {/* Southern China coast (partial, context) */}
        <motion.path
          d={chinaCoast}
          fill={landFill}
          stroke={landStroke}
          strokeWidth="0.6"
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 0.5 } : { opacity: 0 }}
          transition={{ duration: 1.5, delay: 0.1 }}
        />

        {/* All SEA countries */}
        {countries.map((country) => (
          <motion.path
            key={country.name}
            d={country.d}
            fill={landFill}
            stroke={landStroke}
            strokeWidth="0.8"
            filter="url(#land-glow)"
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 1.5, delay: country.delay }}
          />
        ))}

        {/* Vignette overlay */}
        <rect x="60" y="30" width="800" height="660" fill="url(#map-vignette)" rx="8" />

        {/* Connection lines — flight routes */}
        {connections.map(([a, b], i) => (
          <motion.line
            key={`line-${i}`}
            x1={cities[a].x}
            y1={cities[a].y}
            x2={cities[b].x}
            y2={cities[b].y}
            stroke="#60a5fa"
            strokeWidth="1"
            strokeDasharray="5 4"
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 0.3 } : { opacity: 0 }}
            transition={{ duration: 1.5, delay: 1 + i * 0.15 }}
          />
        ))}

        {/* City nodes */}
        {cities.map((city) => (
          <g key={city.name}>
            {/* Outer glow */}
            <motion.circle
              cx={city.x}
              cy={city.y}
              r={city.r * 8}
              fill={city.opacity === 1 ? "url(#city-glow-bright)" : "url(#city-glow)"}
              initial={{ opacity: 0, scale: 0 }}
              animate={
                isInView
                  ? { opacity: city.opacity * 0.6, scale: 1 }
                  : { opacity: 0, scale: 0 }
              }
              transition={{ duration: 1, delay: city.delay + 0.5 }}
              style={{ transformOrigin: `${city.x}px ${city.y}px` }}
            />
            {/* Pulse ring for Singapore */}
            {city.opacity === 1 && (
              <motion.circle
                cx={city.x}
                cy={city.y}
                r={city.r * 3}
                fill="none"
                stroke="#60a5fa"
                strokeWidth="0.6"
                initial={{ opacity: 0 }}
                animate={
                  isInView
                    ? { opacity: [0, 0.4, 0], scale: [1, 2, 3] }
                    : { opacity: 0 }
                }
                transition={{
                  duration: 3,
                  delay: city.delay + 1,
                  repeat: Infinity,
                  repeatDelay: 1,
                }}
                style={{ transformOrigin: `${city.x}px ${city.y}px` }}
              />
            )}
            {/* Core dot */}
            <motion.circle
              cx={city.x}
              cy={city.y}
              r={city.r}
              fill="#60a5fa"
              filter="url(#soft-glow)"
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: city.opacity } : { opacity: 0 }}
              transition={{ duration: 0.6, delay: city.delay + 0.5 }}
            />
            {/* Label */}
            <motion.text
              x={city.x}
              y={city.y - city.r * 2.5 - 5}
              textAnchor="middle"
              fill="white"
              fontSize="10"
              fontFamily="var(--font-heading), system-ui"
              letterSpacing="3"
              initial={{ opacity: 0 }}
              animate={
                isInView ? { opacity: city.opacity * 0.7 } : { opacity: 0 }
              }
              transition={{ duration: 0.6, delay: city.delay + 0.7 }}
            >
              {city.name}
            </motion.text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Industry card                                                     */
/* ------------------------------------------------------------------ */

function IndustryCard({
  title,
  description,
  delay = 0,
}: {
  title: string;
  description: string;
  delay?: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-10%" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
      transition={{ duration: 0.7, delay, ease: [0.25, 0.1, 0.25, 1] }}
      className="border border-white/[0.08] rounded-2xl p-8 bg-white/[0.03] hover:scale-[1.03] hover:border-white/[0.15] hover:bg-white/[0.06] hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)] transition-all duration-300"
    >
      <h3 className="text-lg md:text-xl font-semibold text-white tracking-tight mb-3">
        {title}
      </h3>
      <p className="text-sm md:text-base text-white/50 leading-relaxed">
        {description}
      </p>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

export default function SeaPage() {
  const heroRef = useRef(null);
  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroOpacity = useSpring(
    useTransform(heroProgress, [0, 0.8], [1, 0]),
    smooth
  );
  const heroY = useSpring(
    useTransform(heroProgress, [0, 1], [0, -60]),
    smooth
  );
  const photoScale = useSpring(
    useTransform(heroProgress, [0, 1], [1, 1.08]),
    smooth
  );


  return (
    <main className="relative overflow-x-hidden bg-[#050505]">
      {/* ============================================================ */}
      {/*  HERO — Editorial typography + large photo frame             */}
      {/* ============================================================ */}
      <section ref={heroRef} className="relative min-h-screen flex flex-col justify-center px-6 md:px-16 lg:px-24 pt-32 pb-20">
        {/* Corner labels */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.2 }}
          className="absolute top-8 left-6 md:left-16 lg:left-24"
        >
          <span className="text-[10px] md:text-xs tracking-[0.3em] uppercase text-white/25 font-medium">
            Est. San Diego, CA
          </span>
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.4 }}
          className="absolute top-8 right-6 md:right-16 lg:right-24"
        >
          <span className="text-[10px] md:text-xs tracking-[0.3em] uppercase text-white/25 font-medium">
            Expanding across SEA
          </span>
        </motion.div>

        <motion.div style={{ opacity: heroOpacity, y: heroY }}>
          {/* Main heading */}
          <motion.div
            initial={{ opacity: 0, y: 40, filter: "blur(12px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 1, delay: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <h1 className="text-5xl md:text-7xl lg:text-[5.5rem] font-bold tracking-tight leading-[1.05] text-white max-w-5xl font-[family-name:var(--font-heading)]">
              AI Infrastructure
            </h1>
            <h1 className="text-5xl md:text-7xl lg:text-[5.5rem] font-bold tracking-tight leading-[1.05] text-white/35 max-w-5xl font-[family-name:var(--font-heading)]">
              for Southeast Asia
            </h1>
          </motion.div>

          {/* Large photo frame — Marina Bay Sands, Singapore */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
            className="mt-12 md:mt-16 w-full"
          >
            <div className="relative border border-white/[0.08] rounded-sm overflow-hidden">
              {/* Photo label */}
              <div className="absolute top-0 left-0 right-0 z-10 flex justify-between items-center px-5 py-3 bg-gradient-to-b from-[#050505]/80 to-transparent">
                <span className="text-[9px] md:text-[11px] tracking-[0.25em] uppercase text-white/30">
                  Marina Bay Sands — Singapore
                </span>
                <span className="text-[9px] md:text-[11px] tracking-[0.25em] uppercase text-white/20">
                  2025
                </span>
              </div>

              <motion.div
                style={{ scale: photoScale }}
                className="aspect-[16/9] md:aspect-[2/1] overflow-hidden"
              >
                <img
                  src="https://images.unsplash.com/photo-1496939376851-89342e90adcd?w=1920&q=85&auto=format"
                  alt="Marina Bay Sands and Singapore skyline aerial view at night"
                  className="w-full h-full object-cover object-center"
                />
              </motion.div>

              {/* Bottom gradient */}
              <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#050505]/70 to-transparent" />
            </div>
          </motion.div>

          {/* Subtext */}
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1 }}
            className="mt-8 text-sm md:text-base text-white/40 max-w-xl leading-relaxed"
          >
            Workflow automation and decision intelligence
            across Southeast Asia&apos;s fastest-growing markets.
          </motion.p>
        </motion.div>

        {/* Scroll indicator — matches government page */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1.2 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2"
        >
          <span className="text-[10px] text-white/40 tracking-[0.15em] uppercase">Scroll</span>
          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            className="w-5 h-8 rounded-full border border-white/20 flex items-start justify-center pt-1.5"
          >
            <div className="w-1 h-1.5 rounded-full bg-white/50" />
          </motion.div>
        </motion.div>
      </section>

      {/* ============================================================ */}
      {/*  SECTION 3 — Industries                                      */}
      {/* ============================================================ */}
      <section className="relative py-24 md:py-36 px-6 md:px-16 lg:px-24">
        <div className="max-w-5xl mx-auto">
          <RevealText>
            <span className="text-[10px] md:text-xs tracking-[0.3em] uppercase text-white/30 font-medium">
              Industries
            </span>
          </RevealText>
          <RevealText delay={0.15}>
            <h2 className="mt-4 text-3xl md:text-4xl lg:text-5xl font-bold text-white tracking-tight">
              Built for the region&apos;s
              <br />
              <span className="text-white/40">core verticals.</span>
            </h2>
          </RevealText>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-5">
            <IndustryCard
              title="Finance"
              description="Compliance automation, document extraction, and risk analysis for banking and fintech across multiple regulatory jurisdictions."
              delay={0.1}
            />
            <IndustryCard
              title="Logistics"
              description="Customs processing, shipment tracking intelligence, and supply chain optimization across ASEAN trade corridors."
              delay={0.25}
            />
            <IndustryCard
              title="SMBs"
              description="Affordable AI-powered workflows that scale — invoice processing, customer ops, and back-office automation without enterprise overhead."
              delay={0.4}
            />
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  SECTION 4 — Regional presence with LARGE SVG map            */}
      {/* ============================================================ */}
      <section className="relative py-32 md:py-44 px-6 md:px-16 lg:px-24 overflow-hidden">
        <div className="max-w-6xl mx-auto">
          {/* Text — centered above map */}
          <div className="text-center mb-16 md:mb-20">
            <RevealText>
              <span className="text-[10px] md:text-xs tracking-[0.3em] uppercase text-white/30 font-medium">
                Presence
              </span>
            </RevealText>
            <RevealText delay={0.15}>
              <h2 className="mt-4 text-4xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-tight">
                US-headquartered.
              </h2>
            </RevealText>
            <RevealText delay={0.3}>
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white/40 tracking-tight leading-tight">
                Internationally expanding.
              </h2>
            </RevealText>
            <RevealText delay={0.5}>
              <p className="mt-6 text-sm md:text-base text-white/35 max-w-lg mx-auto leading-relaxed">
                Headquartered in San Diego with active expansion into
                Singapore, Jakarta, and Bangkok, building local
                partnerships and regional infrastructure.
              </p>
            </RevealText>
          </div>

          {/* Full-width map */}
          <RevealText delay={0.3}>
            <div className="relative">
              {/* Subtle border frame */}
              <div className="border border-white/[0.05] rounded-lg p-6 md:p-10 bg-white/[0.01]">
                <SeaMap className="w-full max-w-4xl mx-auto" />
              </div>
            </div>
          </RevealText>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  CTA                                                         */}
      {/* ============================================================ */}
      <section className="relative py-32 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <RevealText>
            <h2 className="text-2xl md:text-4xl font-bold tracking-tight text-white mb-4">
              Ready to Deploy
            </h2>
          </RevealText>
          <RevealText delay={0.1}>
            <p className="text-sm md:text-base text-white/40 mb-10 max-w-md mx-auto">
              Workflow automation and decision intelligence
              for Southeast Asia&apos;s fastest-growing markets. Let&apos;s talk.
            </p>
          </RevealText>
          <RevealText delay={0.2}>
            <div className="flex items-center justify-center gap-4">
              <a
                href="mailto:strvxteam@gmail.com?subject=SEA%20Inquiry"
                className="px-8 py-3.5 rounded-lg bg-white text-[#030810] text-sm font-medium hover:bg-white/90 transition-colors duration-300"
              >
                Get in Touch
              </a>
            </div>
          </RevealText>
          <RevealText delay={0.4}>
            <p className="text-xs font-mono text-white/20 mt-8 tracking-wider">
              strvxteam@gmail.com
            </p>
          </RevealText>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/[0.04] py-8 text-center">
        <span className="text-[10px] text-white/30 tracking-[0.1em] uppercase">
          strvx &middot; San Diego, CA &middot; Singapore
        </span>
      </footer>
    </main>
  );
}
