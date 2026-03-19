'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { X, GripHorizontal } from 'lucide-react';

interface BottomSheetProps {
    children: ReactNode;
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    subtitle?: string;
}

type SnapState = 'peek' | 'half' | 'full';

const SNAP_PERCENTAGES: Record<SnapState, number> = {
    peek: 0.18,
    half: 0.50,
    full: 0.90,
};

export default function BottomSheet({
    children,
    isOpen,
    onClose,
    title,
    subtitle,
}: BottomSheetProps) {
    const [snapState, setSnapState] = useState<SnapState>('half');
    const [windowHeight, setWindowHeight] = useState(0);
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setWindowHeight(window.innerHeight);
        const handleResize = () => setWindowHeight(window.innerHeight);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (isOpen) setSnapState('half');
    }, [isOpen]);

    const sheetHeight = windowHeight * SNAP_PERCENTAGES[snapState];
    const y = useMotionValue(0);
    const opacity = useTransform(y, [0, windowHeight * 0.3], [1, 0]);

    const handleDragEnd = (_: unknown, info: { velocity: { y: number }; offset: { y: number } }) => {
        const velocity = info.velocity.y;
        const offset = info.offset.y;

        if (velocity > 500 || offset > 100) {
            // Swipe down
            if (snapState === 'full') {
                setSnapState('half');
            } else if (snapState === 'half') {
                setSnapState('peek');
            } else {
                onClose();
            }
        } else if (velocity < -500 || offset < -100) {
            // Swipe up
            if (snapState === 'peek') {
                setSnapState('half');
            } else if (snapState === 'half') {
                setSnapState('full');
            }
        }

        animate(y, 0, { type: 'spring', damping: 25, stiffness: 300 });
    };

    if (!isOpen || windowHeight === 0) return null;

    return (
        <>
            {/* Overlay */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: snapState === 'full' ? 0.5 : snapState === 'half' ? 0.3 : 0 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black z-40 md:hidden"
                onClick={() => {
                    if (snapState === 'peek') onClose();
                    else setSnapState('peek');
                }}
            />

            {/* Sheet */}
            <motion.div
                initial={{ y: windowHeight }}
                animate={{ y: windowHeight - sheetHeight }}
                exit={{ y: windowHeight }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                style={{ y, height: windowHeight }}
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={0.2}
                onDragEnd={handleDragEnd}
                className="fixed left-0 right-0 bottom-0 z-50 md:hidden"
            >
                <motion.div
                    style={{ opacity, height: sheetHeight }}
                    className="bg-akhand-surface/95 backdrop-blur-xl rounded-t-2xl border-t border-x border-akhand-border overflow-hidden flex flex-col"
                >
                    {/* Drag handle */}
                    <div className="flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing">
                        <div className="w-10 h-1 rounded-full bg-akhand-text-muted/30" />
                    </div>

                    {/* Header */}
                    {(title || subtitle) && (
                        <div className="flex items-center justify-between px-4 pb-3 border-b border-akhand-border/50">
                            <div className="min-w-0 flex-1">
                                {title && (
                                    <h3 className="text-sm font-semibold text-akhand-text-primary truncate">
                                        {title}
                                    </h3>
                                )}
                                {subtitle && (
                                    <p className="text-[11px] text-akhand-text-muted truncate mt-0.5">
                                        {subtitle}
                                    </p>
                                )}
                            </div>
                            <button
                                onClick={onClose}
                                className="p-1.5 rounded-lg hover:bg-akhand-surface-2 transition-colors ml-2 flex-shrink-0"
                            >
                                <X className="w-4 h-4 text-akhand-text-secondary" />
                            </button>
                        </div>
                    )}

                    {/* Content */}
                    <div
                        ref={contentRef}
                        className="flex-1 overflow-y-auto overscroll-contain px-4 py-3"
                    >
                        {children}
                    </div>
                </motion.div>
            </motion.div>
        </>
    );
}
