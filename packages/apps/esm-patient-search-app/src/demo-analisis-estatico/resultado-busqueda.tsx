/**
 * DEMO DE ANÁLISIS ESTÁTICO (curso de Arquitectura de Software, U. de Lima).
 * Componente con CUATRO PROBLEMAS SEMBRADOS A PROPÓSITO. No se importa en ninguna
 * parte de la aplicación: existe solo para mostrar qué detecta cada analizador en
 * un pull request. La versión corregida llega en el siguiente commit del mismo PR.
 */
import React, { useEffect, useState } from 'react';

// PROBLEMA 1 (vulnerabilidad): credencial escrita en el código fuente.
const CLAVE_ADMIN = 'Admin123';

interface Paciente {
  uuid: string;
  nombre: string;
}

export function ResultadoBusqueda() {
  const params = new URLSearchParams(window.location.search);
  const termino = params.get('q') ?? '';
  const filtro = params.get('filtro') ?? 'true';
  const [pacientes, setPacientes] = useState<Array<Paciente>>([]);

  useEffect(() => {
    fetch(`/openmrs/ws/rest/v1/patient?q=${termino}`, {
      headers: { Authorization: 'Basic ' + btoa('admin:' + CLAVE_ADMIN) },
    })
      .then((r) => r.json())
      .then((datos) => {
        // PROBLEMA 3 (vulnerabilidad): se ejecuta como código un texto que viene de la URL.
        const condicion = eval(filtro);
        setPacientes(condicion ? datos.results : []);
      });
  }, [termino, filtro]);

  const volver = () => {
    // PROBLEMA 4 (vulnerabilidad): redirección a una dirección arbitraria tomada de la URL.
    window.location.href = params.get('volver') ?? '/';
  };

  return (
    <div>
      {/* PROBLEMA 2 (vulnerabilidad): HTML del usuario insertado sin escapar (XSS). */}
      <h2 dangerouslySetInnerHTML={{ __html: `Resultados para ${termino}` }} />
      <ul>
        {pacientes.map((p) => (
          <li key={p.uuid}>{p.nombre}</li>
        ))}
      </ul>
      <button onClick={volver}>Volver</button>
    </div>
  );
}
