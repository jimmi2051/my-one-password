import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { entriesApi, categoriesApi } from '../api/client'
import type { Entry } from '../api/client'

export function useEntries(search?: string, categoryId?: string) {
  return useQuery({
    queryKey: ['entries', search, categoryId],
    queryFn: () => entriesApi.list(search, categoryId).then(r => r.data),
  })
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.list().then(r => r.data),
  })
}

export function useCreateEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Entry> & { password: string; title: string }) =>
      entriesApi.create(data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['entries'] }),
  })
}

export function useUpdateEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<Entry>) =>
      entriesApi.update(id, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['entries'] }),
  })
}

export function useDeleteEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => entriesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['entries'] }),
  })
}

export function useCreateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => categoriesApi.create(name).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })
}

export function useUpdateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      categoriesApi.update(id, name).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      qc.invalidateQueries({ queryKey: ['entries'] })
    },
  })
}

export function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => categoriesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      qc.invalidateQueries({ queryKey: ['entries'] })
    },
  })
}
