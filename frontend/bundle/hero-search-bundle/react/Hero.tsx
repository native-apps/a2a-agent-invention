import React from "react";
import HeroSearchInput from "./HeroSearchInput";
import NeHeroSearch from "./NeHeroSearch";
import { NeButton } from "./NeButton";

const Hero = () => {
  return (
    <section
      id="hero"
      className="relative h-screen flex items-center justify-center text-center overflow-hidden"
    >
      {/* Background Image/Video */}
      <div className="absolute inset-0 z-0">
        <video
          className="w-full h-full object-cover pointer-events-none"
          autoPlay
          muted
          loop
          playsInline
          controls={false}
        >
          <source src="/assets/hero-video.mp4" type="video/mp4" />
          Your browser does not support the video tag.
        </video>
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent"></div>
      </div>

      <div className="w-full relative z-10 flex flex-col items-center px-4">
        {/* Search Input */}
        <div
          className="w-full max-w-3xl mb-8 animate-fade-in-up"
          style={{ animationDelay: "0.5s" }}
        >
          <NeHeroSearch />
        </div>

        {/* Call to Action Buttons */}
        <div
          className="flex flex-col sm:flex-row items-center gap-4 animate-fade-in-up"
          style={{ animationDelay: "0.8s" }}
        >
          <NeButton designId="BTN-RED-01">→ Start Your Project</NeButton>
          <NeButton designId="BTN-AMBER-01">⚡︎ Free Consultation</NeButton>
        </div>

        {/* Animated Tagline */}
        {/*
         <div className="mt-24">
          <p className="text-lg md:text-xl font-mono text-primary animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            ✧ Sovereign Code-Forging / Local-First / Autonomous Ops / Full-Stack Engineering ✧
          </p>
        </div>
        */}
      </div>
    </section>
  );
};

export default Hero;
