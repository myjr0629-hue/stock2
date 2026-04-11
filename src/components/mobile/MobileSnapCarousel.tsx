import React from 'react';

interface MobileSnapCarouselProps {
    children: React.ReactNode;
    title?: string;
}

export function MobileSnapCarousel({ children, title }: MobileSnapCarouselProps) {
    return (
        <div className="w-full mb-4">
            {title && (
                <div className="px-5 mb-2 flex items-center justify-between">
                    <h3 className="text-[13px] font-bold text-slate-400 uppercase tracking-wider font-jakarta">{title}</h3>
                </div>
            )}
            <div className="flex overflow-x-auto snap-x snap-mandatory hide-scrollbars pb-4 px-5 -mx-5 gap-3">
                {React.Children.map(children, (child) => (
                    <div className="snap-center shrink-0 first:pl-5 last:pr-5">
                        {child}
                    </div>
                ))}
            </div>
            
            <style dangerouslySetInnerHTML={{__html: `
                .hide-scrollbars::-webkit-scrollbar {
                    display: none;
                }
                .hide-scrollbars {
                    -ms-overflow-style: none;  /* IE and Edge */
                    scrollbar-width: none;  /* Firefox */
                }
            `}} />
        </div>
    );
}
