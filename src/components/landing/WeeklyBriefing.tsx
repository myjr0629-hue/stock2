

import { Calendar, Flag, Clock } from "lucide-react";

import { getEconomicEvents } from "@/services/stockApi";

export async function WeeklyBriefing() {
    // Live Data: US Economic Calendar (ForexFactory)
    const economicEvents = await getEconomicEvents();

    // Mock Data: Trump Schedule (Translated to Korean)
    const trumpSchedule = [
        { date: "12/23 (Mon)", time: "10:00 AM", event: "Meeting with Tech CEOs on AI Regulation", eventKo: "AI 규제 관련 기술 기업 CEO 회동", location: "White House (백악관)" },
        { date: "12/24 (Tue)", time: "02:00 PM", event: "Christmas Eve Address to the Nation", eventKo: "크리스마스 이브 대국민 담화", location: "Oval Office (집무실)" },
        { date: "12/26 (Thu)", time: "11:00 AM", event: "Cabinet Meeting on Trade Tariffs", eventKo: "무역 관세 관련 국무회의 주재", location: "Cabinet Room (국무회의실)" },
        { date: "12/27 (Fri)", time: "05:00 PM", event: "Departure for Mar-a-Lago Summit", eventKo: "미·중 정상회담 위해 마라라고 출발", location: "Andrews AFB (앤드루스 공군기지)" },
    ];

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 w-full">

            {/* Left Column: Economic Calendar */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-100">
                    <Calendar className="w-4 h-4 text-blue-600" />
                    <div>
                        <h2 className="text-sm font-bold text-slate-800">주간 경제 일정 (US / KST)</h2>
                        <p className="text-[10px] text-slate-400 font-medium tracking-wide">Weekly Economic Calendar</p>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                        <thead className="text-[10px] text-slate-500 uppercase bg-slate-50/50">
                            <tr>
                                <th className="px-2 py-2 rounded-l-lg">Date / Time (ET / KST)</th>
                                <th className="px-2 py-2">Event</th>
                                <th className="px-2 py-2">Forecast</th>
                                <th className="px-2 py-2 rounded-r-lg">Actual</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {economicEvents.map((item, idx) => (
                                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-2 py-2 font-medium text-slate-600 whitespace-nowrap">
                                        <div className="flex flex-col">
                                            <span className="text-slate-900 font-bold text-xs">{item.date}</span>
                                            <div className="flex items-center gap-1 mt-0.5">
                                                <span className="text-[9px] text-slate-400 font-medium">ET {item.timeEt}</span>
                                            </div>
                                            {item.timeKst !== '-' && (
                                                <div className="flex items-center gap-1">
                                                    <span className="text-[9px] text-indigo-500 font-bold">KST {item.timeKst}</span>
                                                    {['22:30', '23:00', '23:45', '00:00'].some(t => item.timeKst.includes(t)) && <span className="text-[9px] bg-indigo-50 text-indigo-600 px-1 rounded">HOT</span>}
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-2 py-2">
                                        <div className="flex flex-col gap-0.5">
                                            <div className="flex items-center gap-2">
                                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.impact === 'high' ? 'bg-rose-500' : item.impact === 'medium' ? 'bg-amber-400' : 'bg-slate-300'}`} />
                                                <span className="font-bold text-slate-800 leading-tight">{item.eventKo}</span>
                                            </div>
                                            <span className="text-[10px] text-slate-400 pl-3.5 tracking-tight">{item.event}</span>
                                        </div>
                                    </td>
                                    <td className="px-2 py-2 text-slate-500">{item.forecast}</td>
                                    <td className="px-2 py-2 font-bold text-slate-700">{item.actual}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Right Column: Trump Schedule */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-100">
                    <Flag className="w-4 h-4 text-rose-600" />
                    <div>
                        <h2 className="text-sm font-bold text-slate-800">트럼프 대통령 일정</h2>
                        <p className="text-[10px] text-slate-400 font-medium tracking-wide">President Trump's Schedule</p>
                    </div>
                </div>

                <div className="space-y-4 pl-1">
                    {trumpSchedule.map((item, idx) => (
                        <div key={idx} className="relative pl-4 border-l-2 border-slate-100 last:border-0 pb-1">
                            {/* Timeline Dot */}
                            <div className="absolute top-1.5 -left-[5px] w-2.5 h-2.5 rounded-full bg-blue-600 ring-4 ring-white" />

                            <div className="flex flex-col gap-0.5">
                                {/* Title Row with Time Badge next to it */}
                                <div className="flex items-start justify-between gap-2">
                                    <h3 className="text-sm font-bold text-slate-800 leading-tight">
                                        {item.eventKo}
                                    </h3>
                                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded ml-auto whitespace-nowrap">
                                        <Clock className="w-2.5 h-2.5" />
                                        {item.date} {item.time}
                                    </div>
                                </div>

                                <p className="text-[10px] text-slate-400 leading-snug">{item.event}</p>
                                <div className="flex items-center gap-2 text-[10px] text-slate-500 font-medium mt-0.5">
                                    <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{item.location}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

        </div>
    );
}
