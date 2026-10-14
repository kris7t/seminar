import type {
  ComponentNameToClassKey,
  ComponentsOverrides,
  ComponentsProps,
  ComponentsPropsList,
  ComponentsVariants,
} from '@mui/material/styles';

/**
 * Theme options of a custom component in the `components` of an MUI theme.
 *
 * The component must be added to `ComponentNameToClassKey` and
 * `ComponentsPropsList` by module augmentation.
 */
export interface ComponentTheme<
  Name extends keyof ComponentNameToClassKey & keyof ComponentsPropsList,
  Theme,
> {
  defaultProps?: ComponentsProps[Name] | undefined;
  styleOverrides?: ComponentsOverrides<Theme>[Name] | undefined;
  variants?: ComponentsVariants<Theme>[Name] | undefined;
}
