# Versiones de Montra

La versión aparece al final de la pestaña **Ajustes**, junto con la fecha y hora de la actualización.

## 1.10.4 · 20 oct 2026

- Corregido: en divisas sin decimales (como el yen), al guardar un saldo como «176.967» el punto de los miles se leía como decimal y quedaba en 177 ¥. Ahora un punto seguido de grupos de tres cifras se lee como separador de miles.
- Los registros y saldos que se guardaron mal por este fallo se reparan automáticamente al abrir esta versión (176,967 ¥ vuelve a ser 176.967 ¥).

## 1.10.3 · 20 oct 2026

- «Enviar notificación de prueba» ahora dice qué ha pasado: a cuántos dispositivos se ha enviado, si no hay ninguno registrado o qué error ha devuelto Firebase.
- Antes de cada prueba, el dispositivo vuelve a registrarse (sin preguntar) por si su identificador de notificaciones había cambiado.
- Los avisos se envían también como notificación estándar, para que el navegador los muestre aunque falle la app.

## 1.10.2 · 20 oct 2026

- Ordenador: al abrir una ficha por la derecha (una cuenta, Revolut, una subcuenta…) el resto de la página se desenfoca; al pulsar en esa zona, o con la tecla Esc, se vuelve atrás.
- Las ventanas centradas (editar cuenta, actualizar saldos, registros…) también desenfocan el fondo.

## 1.10.1 · 20 oct 2026

- Inicio de sesión rediseñado para ordenador: la marca, el lema y lo que hace Montra a la izquierda, y una tarjeta de acceso con Google a la derecha.
- Las pantallas de código PIN y de acceso restringido ya no se estiran en ordenador: quedan centradas con un ancho cómodo.

## 1.10.0 · 20 oct 2026

- **Versión para ordenador.** Con la ventana ancha (desde 1024 px) Montra cambia sola de diseño:
  - Barra lateral con Resumen, Cuentas, Evolución y Ajustes, el próximo recordatorio y tu usuario con la versión.
  - **Resumen** (nueva, solo en ordenador): total con su variación, variación de los últimos 6 meses, porcentaje en otras divisas, gráfica de evolución, cuentas con su peso en el total (incluidas las subcuentas) y las últimas actualizaciones.
  - Las hojas se abren como ventanas centradas y las fichas de cuenta como un panel lateral a la derecha.
  - Efectos al pasar el ratón sobre lo que se puede pulsar.
- En el móvil todo sigue igual.

## 1.9.1 · 20 oct 2026

- Corregido: en las hojas largas (como «Editar cuenta») los botones de abajo ya no se aplastan; si el contenido no cabe, la hoja se desplaza.

## 1.9.0 · 20 oct 2026

- **Subcuentas.** Una cuenta puede contener subcuentas (por ejemplo, Revolut con Principal en EUR, Dólares en USD y Compartida en JPY). La cuenta no tiene saldo propio: su saldo es la suma de sus subcuentas, y cada subcuenta mantiene su divisa, color e historial.
- En **Cuentas**, la cuenta con subcuentas se despliega con la flecha; al tocarla se abre su ficha.
- **Ficha de la cuenta con subcuentas:** suma, barra de reparto por subcuenta, «Actualizar saldos» solo de esa cuenta, lista de subcuentas, «Añadir subcuenta» e historial conjunto.
- **Nueva cuenta:** opción «Con subcuentas» y selector **«Dentro de»** para crear subcuentas o mover cuentas existentes dentro de otra desde su «Editar».
- **Actualizar saldos** agrupa las subcuentas bajo su cuenta, con la suma en vivo.
- **Evolución:** la cuenta con subcuentas es una línea más (la suma); al elegirla aparecen sus subcuentas para verlas por separado. En «Registros», filtrar por ella muestra los de todas sus subcuentas.
- Tus cuentas de Revolut se agrupan automáticamente en una cuenta «Revolut» la primera vez que abres esta versión. El total y el historial no cambian.

## 1.8.1 · 20 oct 2026

- Barra inferior unos 14 pt más baja, con una altura parecida a la de las apps nativas de iOS; los botones siguen por encima de la barra de inicio del iPhone.

## 1.8.0 · 20 oct 2026

- El código o Face ID ya no se pide cada vez que sales un momento de la app: si vuelves antes de **5 minutos**, entras directamente. También al pulsar «Actualizar» o si iOS cierra la app por detrás.
- Nuevo ajuste **Ajustes → Seguridad → Pedir código**: al salir, a 1, 5 o 15 minutos.

## 1.7.1 · 20 oct 2026

- La barra inferior vuelve a dejar siempre el margen de la barra de inicio del iPhone, así sus botones no quedan encima de ella. La 1.6.1 lo quitaba al creer que iOS había recortado la pantalla, y esa detección fallaba.

## 1.7.0 · 20 oct 2026

- Evolución: nuevo periodo **1S** (última semana), con una marca por día en el eje.
- Registros: con «Todas las cuentas» solo aparecen las actualizaciones de saldos; los registros sueltos de una cuenta (saldo inicial, ediciones a mano) se ven al filtrar por esa cuenta o en su ficha.

## 1.6.1 · 20 oct 2026

- Editar registro: los campos de fecha y hora ya no se salen del cuadro.
- En lugar de «Antes», se muestra el registro anterior de la cuenta y la diferencia («Registro anterior (6 oct): 3.200,00 € · +229,52 €»), recalculada al cambiar el valor o la fecha.
- Los registros convertidos de versiones anteriores muestran su hora original en «Introducido el…».
- Si iOS recorta la parte de abajo de la pantalla, la franja toma el color de lo que haya encima (barra, hoja o ficha de cuenta) y no se reserva el margen de la barra de inicio, que queda fuera de la vista.

## 1.6.0 · 20 oct 2026

- Las hojas que suben desde abajo (nueva cuenta, actualizar saldos, registros, recordatorios, divisas) se pueden **arrastrar hacia abajo para cerrarlas**, como en iOS. Si las sueltas a medio camino vuelven a su sitio; el fondo se aclara mientras las arrastras. Tienen un asa arriba que lo indica.
- **Barra inferior:** se vuelve al diseño de la 1.0 (la página se desplaza y la barra queda fija abajo), que es el que mejor se lleva con iOS. Si iOS recorta la parte de abajo de la pantalla, cosa que pasa a veces con la app instalada, la franja que queda tiene el color de la barra y no se nota.

## 1.5.0 · 20 oct 2026

- **Historial de registros.** Cada valor que introduces queda guardado con su fecha, hora y origen (saldo inicial, actualización de saldos o editado a mano).
- **Ficha de cuenta:** al tocar una cuenta se abre su ficha con el saldo, una mini gráfica y su historial por meses. Desliza un registro hacia la izquierda para **Editar** o **Eliminar**, o tócalo para editarlo.
- **Editar registro:** cambia el valor, la fecha y la hora, o añade una nota. Antes de guardar se ve cómo cambiará el total de ese día en la gráfica.
- **Apuntar saldo nuevo** desde la ficha, también con una fecha pasada.
- **Eliminar con deshacer:** al borrar un registro o una actualización aparece «Deshacer» durante unos segundos.
- **Evolución → Registros:** debajo de la gráfica, todas las actualizaciones agrupadas; al tocar una se despliega con el valor de cada cuenta y se marca su día en la gráfica. Filtro por cuenta.
- **La gráfica es diaria:** un punto por día con el último valor de cada cuenta.
- Al eliminar una cuenta, su historial anterior se conserva y deja de contar en el total desde ese día.
- Los datos anteriores se convierten automáticamente en registros la primera vez que abres esta versión.

## 1.4.0 · 20 oct 2026

- Evolución: si seleccionas solo cuentas de una misma divisa extranjera (sin el total), la gráfica, la cifra principal y el detalle al tocar se muestran en esa divisa (por ejemplo, en USD).
- Las cuentas en otra divisa ya no desaparecen al mezclarlas con el total: se muestran convertidas, calculando el valor con el tipo de cambio de cada momento si no estaba guardado.
- La cifra principal muestra el total o, si no está seleccionado, la suma de las cuentas elegidas.
- Animación al cambiar de periodo, de divisa o al añadir y quitar líneas: la gráfica se dibuja de izquierda a derecha.

## 1.3.1 · 20 oct 2026

- Corregida la barra inferior elevada en el iPhone con la app instalada: la app usa ahora la altura real de la pantalla (iOS descontaba la zona de la Dynamic Island). Lo mismo para las hojas y las pantallas de acceso.

## 1.3.0 · 20 oct 2026

- Transiciones suaves: al cambiar de pestaña el contenido se desliza hacia el lado al que vas; las hojas (cuenta, actualizar saldos, recordatorios, divisas) suben y bajan con animación al abrirse y cerrarse.
- La app aparece con un fundido al desbloquearla; el aviso de versión nueva entra deslizándose.
- Respuesta visual al tocar botones, filas y teclas. Si el iPhone tiene activado «Reducir movimiento», las animaciones se desactivan.

## 1.2.0 · 20 oct 2026

- Evolución: el eje horizontal muestra siempre el periodo completo elegido (1 mes, 3 meses, 6 meses, 1 año), aunque todavía no haya registros en todo ese tiempo. «Todo» va desde el primer registro hasta hoy.
- Marcas del eje según el periodo: fechas repartidas en 1M, días 1 y 15 en 3M, meses en 6M y cada dos meses en 1A.

## 1.1.0 · 20 oct 2026

- Aviso «Nueva versión» con botón **Actualizar** cuando se publica una versión nueva.
- La barra inferior queda fija abajo; solo se desplaza el contenido de cada pestaña.
- Tipos de cambio: si faltan, el servidor los descarga del BCE en el momento (antes había que esperar a las 16:45). Mientras llegan, la app avisa de qué divisas faltan.
- El punto de la evolución que no se pudo guardar por falta de tipo de cambio se guarda en cuanto llegan los tipos.

## 1.0.1 · 20 oct 2026

- Face ID se lanza solo al volver a la app y ya no muestra «no disponible» cuando iOS rechaza el intento automático; el botón de Face ID sigue funcionando siempre.

## 1.0.0 · 20 oct 2026

Primera versión.

- Acceso con Google, código de 4 dígitos y Face ID cada vez que se abre la app.
- Cuentas en varias divisas con el total convertido a la divisa elegida (tipos del BCE del día).
- Actualizar todos los saldos de una vez.
- Evolución del total y de cada cuenta; al tocar un punto se ven la fecha y el saldo.
- Ajustes: PIN, Face ID, divisa del total, tema oscuro / claro / sistema, notificaciones y recordatorios.
- Indicador de versión al final de Ajustes.
