'use client'

import { useState } from "react"
import { Maximize2, Minimize2 } from "lucide-react"

const teamMembers = [
    {
        name: "រុន រស្មី",
        nameEn: "Run Raksmey",
        role: "អ្នកអភិវឌ្ឍន៍កម្មវិធី (Full-Stack Developer)",
        image: "/team/ron_raksmey.png",
        portfolio: "https://portfolio-ron-raksmey.netlify.app/",
        description: "មានជំនាញក្នុងការសាងសង់ប្រព័ន្ធវេបសាយធំៗ និងឧបករណ៍អប់រំដែលងាយស្រួលប្រើប្រាស់។ ផ្តោតការយកចិត្តទុកដាក់លើការដោះស្រាយបញ្ហាស្មុគស្មាញ តាមរយៈការសរសេរកូដដែលមានប្រសិទ្ធភាព និងស្អាតបាត។"
    },
    {
        name: "ហ៊ុំ សាណេត",
        nameEn: "Hum Sanet",
        role: "អ្នកអភិវឌ្ឍន៍កម្មវិធី (Full-Stack Developer)",
        image: "/team/hum_sanet.png",
        portfolio: "https://mongkul-digital.vercel.app/portfolio",
        description: "មានចំណង់ចំណូលចិត្តក្នុងការបង្កើតបទពិសោធន៍អ្នកប្រើប្រាស់ដ៏រលូន និងផ្ទៃមុខកម្មវិធីបែបទំនើប។ ជឿជាក់ថារចនាបថដ៏អស្ចារ្យ គឺជាមូលដ្ឋានគ្រឹះនៃការអប់រំឌីជីថលដ៏មានប្រសិទ្ធភាព។"
    }
]

export default function TeamPage() {
    const [openIframeIndex, setOpenIframeIndex] = useState<number | null>(null);

    return (
        <div className="min-h-screen bg-bg-app dark:bg-bg-app pb-24 transition-colors duration-500 font-sans">
            
            <main className="pt-8 md:pt-16 pb-20 px-4 md:px-8 max-w-4xl mx-auto">
                
                {/* Brand Logo & Header */}
                <section className="flex flex-col items-center justify-center mb-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="w-24 h-24 md:w-28 md:h-28 rounded-xl flex items-center justify-center shadow-lg mb-6 rotate-3 hover:rotate-0 transition-transform duration-500 overflow-hidden bg-white p-1">
                        {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded/remote image on a print or avatar surface; next/image adds no value here and breaks print + PDF capture */}
                        <img src="/logo.png" alt="KruSmart Logo" className="w-full h-full object-cover rounded-xl" />
                    </div>
                    <h2 className="text-3xl md:text-5xl font-bold text-brand dark:text-brand-400">
                        KruSmart
                    </h2>
                </section>

                {/* Developer Stack */}
                <div className="grid grid-cols-1 gap-8 md:gap-10">
                    {teamMembers.map((member, index) => (
                        <article 
                            key={index}
                            className="bg-white dark:bg-bg-app border border-divider dark:border-divider rounded-xl p-6 md:p-8 shadow-sm hover:-translate-y-1 hover:shadow-md transition-all duration-300 flex flex-col md:flex-row items-start gap-6 md:gap-10 text-center md:text-left group animate-in zoom-in-95 duration-700"
                            style={{ animationDelay: `${index * 150}ms` }}
                        >
                            {/* Image with Pulsing Gradient Background */}
                            <div className="relative shrink-0 mx-auto md:mx-0">
                                <div className="absolute inset-0 bg-gradient-to-tr from-brand-800 to-brand-400 rounded-full -m-1 animate-pulse opacity-20 dark:opacity-40"></div>
                                {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded/remote image on a print or avatar surface; next/image adds no value here and breaks print + PDF capture */}
                                <img 
                                    alt={member.name} 
                                    src={member.image}
                                    className="w-32 h-32 md:w-40 md:h-40 rounded-full object-cover border-4 border-white dark:border-divider shadow-sm relative z-10 bg-paper dark:bg-bg-surface" 
                                />
                            </div>

                            {/* Content */}
                            <div className="flex-1 space-y-3 w-full">
                                {/* Name */}
                                <div className="flex flex-col md:flex-row md:items-end gap-1 md:gap-3 justify-center md:justify-start">
                                    <h3 className="kh-moul text-xl md:text-2xl text-text-heading dark:text-white">
                                        {member.name}
                                    </h3>
                                    <span className="text-text-muted dark:text-text-body hidden md:block mb-1">•</span>
                                    <h3 className="text-lg md:text-xl font-bold text-text-body dark:text-text-muted md:mb-0.5">
                                        {member.nameEn}
                                    </h3>
                                </div>

                                {/* Role Badge */}
                                <div className="inline-flex items-center px-4 py-1.5 bg-brand-100 dark:bg-brand-900/40 text-brand dark:text-brand-400 text-sm font-semibold rounded-full border border-divider dark:border-brand-800/50">
                                    {member.role}
                                </div>

                                {/* Bio */}
                                <p className="text-text-body dark:text-text-muted leading-relaxed max-w-full text-[15px] md:text-base pt-1">
                                    {member.description}
                                </p>

                                {/* Action Button */}
                                <div className="pt-4 w-full">
                                    {member.portfolio !== '#' && (
                                        <button 
                                            onClick={() => setOpenIframeIndex(index)}
                                            className="inline-flex items-center gap-2 text-brand dark:text-brand-400 font-semibold hover:text-brand-800 dark:hover:text-brand-300 transition-all group/btn self-center md:self-start bg-brand-100 dark:bg-brand-900/40 px-5 py-2.5 rounded-lg shadow-sm hover:shadow"
                                        >
                                            មើលស្នាដៃពេញ (View Fullscreen) <Maximize2 className="w-4 h-4 group-hover/btn:scale-110 transition-transform" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </article>
                    ))}
                </div>

                {/* Fullscreen Iframe Modal */}
                {openIframeIndex !== null && (
                    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex flex-col animate-in fade-in duration-300">
                        <div className="flex justify-end p-4">
                            <button 
                                onClick={() => setOpenIframeIndex(null)}
                                className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-full backdrop-blur-md transition-all font-medium"
                            >
                                <Minimize2 className="w-4 h-4" /> បិទ (Close)
                            </button>
                        </div>
                        <div className="flex-1 w-full h-full pb-4 px-4">
                            <div className="w-full h-full bg-white dark:bg-bg-app rounded-xl overflow-hidden shadow-lg">
                                <iframe 
                                    src={teamMembers[openIframeIndex].portfolio} 
                                    className="w-full h-full border-none" 
                                    title={`Portfolio of ${teamMembers[openIframeIndex].nameEn}`} 
                                />
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    )
}
