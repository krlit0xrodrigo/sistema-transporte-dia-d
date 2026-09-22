export interface TraccarGroup {
  id: number;
  name: string;
  groupId: number; // parent group id, 0 if none
}

export interface TraccarDevice {
  id: number;
  name: string;
  uniqueId: string;
  groupId: number;
  phone: string;
  model: string;
  contact: string;
  category: string;
  disabled: boolean;
  status: string;
}

export class TraccarService {
  private static get baseUrl() {
    return process.env.TRACCAR_API_URL || 'https://chofer.equipombarete.com/api';
  }

  private static get headers(): Record<string, string> {
    const token = process.env.TRACCAR_API_TOKEN;
    if (token) {
      return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      };
    }
    
    const username = process.env.TRACCAR_USERNAME;
    const password = process.env.TRACCAR_PASSWORD;
    if (username && password) {
      const basic = Buffer.from(`${username}:${password}`).toString('base64');
      return {
        'Authorization': `Basic ${basic}`,
        'Content-Type': 'application/json',
      };
    }

    console.warn("TraccarService: Faltan credenciales (TRACCAR_API_TOKEN o TRACCAR_USERNAME/PASSWORD) en el entorno.");
    return { 'Content-Type': 'application/json' };
  }

  private static async fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const res = await fetch(url, {
      ...options,
      headers: {
        ...this.headers,
        ...(options.headers as Record<string, string> || {}),
      },
    });

    if (!res.ok) {
      let errorMsg = `Traccar API Error ${res.status} en ${endpoint}`;
      try {
        const text = await res.text();
        errorMsg += `: ${text}`;
      } catch (e) {
        // Ignorar
      }
      throw new Error(errorMsg);
    }

    // Algunos endpoints como PUT/DELETE o incluso POST pueden devolver vacío
    const text = await res.text();
    return text ? JSON.parse(text) : (null as unknown as T);
  }

  /**
   * Obtiene todos los grupos
   */
  static async getGroups(): Promise<TraccarGroup[]> {
    return this.fetchApi<TraccarGroup[]>('/groups');
  }

  /**
   * Crea un grupo en Traccar
   */
  static async createGroup(name: string, parentGroupId: number = 0): Promise<TraccarGroup> {
    return this.fetchApi<TraccarGroup>('/groups', {
      method: 'POST',
      body: JSON.stringify({ name, groupId: parentGroupId }),
    });
  }

  /**
   * Busca o crea un grupo por nombre y padre
   */
  static async getOrCreateGroup(name: string, parentGroupId: number = 0, allGroups?: TraccarGroup[]): Promise<TraccarGroup> {
    const groups = allGroups || await this.getGroups();
    
    // Buscar si existe el grupo con el mismo nombre y mismo padre
    const existing = groups.find(g => 
      g.name.trim().toLowerCase() === name.trim().toLowerCase() && 
      (g.groupId === parentGroupId || (!g.groupId && !parentGroupId))
    );

    if (existing) {
      return existing;
    }

    // No existe, crearlo
    const newGroup = await this.createGroup(name, parentGroupId);
    
    // Si pasamos el array original por referencia, podemos actualizarlo
    // para no tener que hacer refetch en caso de múltiples creaciones secuenciales.
    if (allGroups) {
      allGroups.push(newGroup);
    }
    
    return newGroup;
  }

  /**
   * Obtiene todos los dispositivos
   */
  static async getDevices(): Promise<TraccarDevice[]> {
    return this.fetchApi<TraccarDevice[]>('/devices');
  }

  /**
   * Crea un dispositivo y lo asigna al grupo especificado
   */
  static async createDevice(
    name: string, 
    uniqueId: string, 
    groupId?: number,
    extras?: { phone?: string; model?: string; category?: string; contact?: string; attributes?: any }
  ): Promise<TraccarDevice> {
    const payload: any = { name, uniqueId, ...extras };
    if (groupId) {
      payload.groupId = groupId;
    }

    return this.fetchApi<TraccarDevice>('/devices', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
  
  /**
   * Actualiza un dispositivo existente
   */
  static async updateDevice(
    id: number, 
    name: string, 
    uniqueId: string, 
    groupId?: number,
    extras?: { phone?: string; model?: string; category?: string; contact?: string; attributes?: any }
  ): Promise<TraccarDevice> {
    const payload: any = { id, name, uniqueId, ...extras };
    if (groupId) {
      payload.groupId = groupId;
    }
    
    return this.fetchApi<TraccarDevice>(`/devices/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Sincroniza (crea o actualiza) un chofer como dispositivo en Traccar,
   * creando también la jerarquía de grupos: Candidato > Supervisor > Barrio
   * 
   * @param choferInfo Información básica del chofer
   * @param jerarquia Nombres de los grupos (Candidato, Supervisor, Barrio)
   */
  static async syncChofer(
    choferInfo: { 
      ci: string; 
      nombres: string; 
      apellidos?: string; 
      chapa?: string;
      telefono?: string;
      marca?: string;
      modelo?: string;
      categoria?: string;
    },
    jerarquia: { candidatoNombre?: string; supervisorNombre?: string; barrioNombre?: string }
  ): Promise<void> {
    try {
      if (!process.env.TRACCAR_API_TOKEN && !(process.env.TRACCAR_USERNAME && process.env.TRACCAR_PASSWORD)) {
        console.warn("TraccarService: Sincronización saltada. No hay credenciales configuradas.");
        return;
      }

      console.log(`TraccarService: Sincronizando chofer ${choferInfo.ci}...`);
      
      const allGroups = await this.getGroups();
      
      let currentParentId = 0;

      // 1. Grupo Candidato
      if (jerarquia.candidatoNombre) {
        const cGroup = await this.getOrCreateGroup(jerarquia.candidatoNombre, 0, allGroups);
        currentParentId = cGroup.id;
        
        // 2. Grupo Supervisor
        if (jerarquia.supervisorNombre) {
          const sGroup = await this.getOrCreateGroup(jerarquia.supervisorNombre, currentParentId, allGroups);
          currentParentId = sGroup.id;
          
          // 3. Grupo Barrio
          if (jerarquia.barrioNombre) {
            const bGroup = await this.getOrCreateGroup(jerarquia.barrioNombre, currentParentId, allGroups);
            currentParentId = bGroup.id;
          }
        }
      }

      // Nombre del dispositivo en Traccar
      const apellidosStr = choferInfo.apellidos ? ` ${choferInfo.apellidos}` : '';
      let deviceName = `${choferInfo.ci} - ${choferInfo.nombres}${apellidosStr}`;
      if (choferInfo.chapa) {
        deviceName += ` (${choferInfo.chapa})`;
      }
      
      // Limpiar CI para usar como uniqueId (sin puntos)
      const uniqueId = choferInfo.ci.replace(/[^0-9]/g, "");

      // Buscar si el dispositivo ya existe
      const allDevices = await this.getDevices();
      const existingDevice = allDevices.find(d => d.uniqueId === uniqueId);

      // Mapear categoría a los íconos de Traccar
      let traccarCategory = "car";
      if (choferInfo.categoria?.toLowerCase().includes("moto")) traccarCategory = "motorcycle";
      else if (choferInfo.categoria?.toLowerCase().includes("camion")) traccarCategory = "truck";
      else if (choferInfo.categoria?.toLowerCase().includes("bus") || choferInfo.categoria?.toLowerCase().includes("colectivo")) traccarCategory = "bus";

      const extras = {
        phone: choferInfo.telefono || "",
        model: `${choferInfo.marca || ""} ${choferInfo.modelo || ""}`.trim(),
        category: traccarCategory,
        attributes: {
          chapa: choferInfo.chapa || ""
        }
      };

      if (existingDevice) {
        // Actualizar
        console.log(`TraccarService: Actualizando dispositivo existente ${existingDevice.id}...`);
        await this.updateDevice(existingDevice.id, deviceName, uniqueId, currentParentId, extras);
      } else {
        // Crear
        console.log(`TraccarService: Creando nuevo dispositivo en Traccar...`);
        await this.createDevice(deviceName, uniqueId, currentParentId, extras);
      }
      
      console.log(`TraccarService: Chofer ${uniqueId} sincronizado exitosamente en Traccar.`);
    } catch (error) {
      // Atrapamos el error para no bloquear el flujo de la app
      console.error("TraccarService: Error al sincronizar con Traccar:", error);
    }
  }
}
