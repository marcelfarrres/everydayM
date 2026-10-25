'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Upload, CheckCircle2, Loader2 } from 'lucide-react';
import {
  getLegacyMuscle,
  MuscleSelector,
} from '@/components/workout/MuscleSelector';
import { DifficultyScale } from '@/components/ui/DifficultyScale';
import type { MuscleSelection } from '@/types/workout';

export default function AdminUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    type: 'workout',
    difficulty: 5,
    muscles: [] as MuscleSelection[],
    equipment: 'ninguno',
  });

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      alert('Por favor selecciona un archivo de vídeo .mp4');
      return;
    }

    const primaryMuscle = formData.muscles.find((muscle) => muscle.role === 'primary');
    if (formData.type === 'workout' && !primaryMuscle) {
      setMessage('Error: marca al menos un músculo principal.');
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `videos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('workout-videos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('workout-videos')
        .getPublicUrl(filePath);

      const videoUrl = publicUrlData.publicUrl;

      const { error: dbError } = await supabase.from('exercises').insert([
        {
          title: formData.title,
          type: formData.type,
          difficulty: formData.difficulty,
          muscle: primaryMuscle ? getLegacyMuscle(primaryMuscle.id) : 'cuerpo_completo',
          muscles: formData.type === 'workout' ? formData.muscles : [],
          equipment: formData.equipment,
          video_url: videoUrl,
          duration_seconds: 60,
        },
      ]);

      if (dbError) throw dbError;

      setMessage('¡Vídeo guardado con éxito!');
      setFile(null);
      setFormData({
        title: '',
        type: 'workout',
        difficulty: 5,
        muscles: [],
        equipment: 'ninguno',
      });
    } catch (err: unknown) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : 'No se pudo subir';
      setMessage(`Error: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-xl bg-neutral-900/60 border border-neutral-800 rounded-3xl p-8 backdrop-blur-xl shadow-2xl">
        <h1 className="text-2xl font-black tracking-tight text-white mb-2 uppercase">Panel de Subida</h1>
        <p className="text-sm font-medium text-neutral-400 mb-8">Añade clips a la base de datos.</p>

        <form onSubmit={handleUpload} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black text-neutral-400 mb-2 uppercase tracking-[0.15em]">Título del ejercicio</label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Ej. Flexiones diamante"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-[#4ade80] transition-colors text-white placeholder-neutral-700"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-neutral-400 mb-2 uppercase tracking-[0.15em]">Tipo de Clip</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-[#4ade80] transition-colors text-white"
              >
                <option value="workout">Rutina Principal (Entreno)</option>
                <option value="warmup">Calentamiento</option>
                <option value="intro">Intro (Vídeo inicial)</option>
              </select>
            </div>
          </div>

          <DifficultyScale
            value={formData.difficulty}
            onChange={(difficulty) => setFormData({ ...formData, difficulty })}
          />

          {formData.type === 'workout' && (
            <MuscleSelector
              value={formData.muscles}
              onChange={(muscles) => setFormData({ ...formData, muscles })}
            />
          )}

          <div>
            <label className="block text-[10px] font-black text-neutral-400 mb-2 uppercase tracking-[0.15em]">Equipamiento</label>
            <select
              value={formData.equipment}
              onChange={(e) => setFormData({ ...formData, equipment: e.target.value })}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-[#4ade80] transition-colors text-white"
            >
              <option value="ninguno">Ninguno (Peso corporal)</option>
              <option value="mancuernas">Mancuernas</option>
              <option value="bandas">Bandas elásticas</option>
              <option value="esterilla">Esterilla</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-black text-neutral-400 mb-2 uppercase tracking-[0.15em]">Archivo de vídeo (.mp4)</label>
            <input
              type="file"
              accept="video/mp4,video/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-sm font-medium text-neutral-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-[10px] file:uppercase file:tracking-wider file:font-black file:bg-[#22c55e]/10 file:text-[#4ade80] hover:file:bg-[#22c55e]/20 cursor-pointer transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-black font-black uppercase tracking-wider py-4 rounded-xl hover:bg-neutral-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Subiendo a la nube...
              </>
            ) : (
              <>
                <Upload className="w-5 h-5" />
                Publicar Ejercicio
              </>
            )}
          </button>
        </form>

        {message && (
          <div className={`mt-6 p-4 rounded-xl text-sm font-bold flex items-center gap-3 ${message.startsWith('Error') ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-[#22c55e]/10 text-[#4ade80] border border-[#22c55e]/20'}`}>
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span>{message}</span>
          </div>
        )}
      </div>
    </div>
  );
}
