// Se carga bajo demanda: quien solo reserva no descarga el código del panel.
import { Route, Routes } from 'react-router-dom';
import { NoEncontrada } from '../paginas/NoEncontrada';
import { AdminAjustes } from './AdminAjustes';
import { AdminFechas } from './AdminFechas';
import { AdminHistorial } from './AdminHistorial';
import { AdminParticipantes } from './AdminParticipantes';
import { AdminReservas } from './AdminReservas';
import { AdminResumen } from './AdminResumen';
import AdminRaiz from './AdminRaiz';

export default function RutasAdmin() {
  return (
    <Routes>
      <Route element={<AdminRaiz />}>
        <Route index element={<AdminResumen />} />
        <Route path="fechas" element={<AdminFechas />} />
        <Route path="reservas" element={<AdminReservas />} />
        <Route path="participantes" element={<AdminParticipantes />} />
        <Route path="historial" element={<AdminHistorial />} />
        <Route path="ajustes" element={<AdminAjustes />} />
        <Route path="*" element={<NoEncontrada />} />
      </Route>
    </Routes>
  );
}
